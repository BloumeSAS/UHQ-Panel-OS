import { BeforeApplicationShutdown, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationService } from '../notifications/notification.service';

interface HostStats {
  /** Minuit local (ms) du jour où ces octets ont été consommés — pas celui du flush. */
  day: number;
  hostname: string;
  sent: number;
  received: number;
  reqs: number;
}

interface UserStats {
  sent: number;
  received: number;
  /** Clé = `${day}|${hostname}`. */
  hosts: Map<string, HostStats>;
}

/** Fenêtre glissante du débit "live" (secondes complètes). */
const RATE_WINDOW_S = 5;
/** +1 case : la seconde en cours ne doit pas écraser la plus ancienne de la fenêtre. */
const RATE_RING = RATE_WINDOW_S + 1;

interface RateRing {
  secs: number[];
  sent: number[];
  received: number[];
}

const GiB = 1024 ** 3;

/**
 * In-memory traffic accumulator. Equivalent of Python `TrafficManager`.
 * Buffers per-user / per-hostname stats and flushes them to the DB every
 * 5s using atomic Prisma `increment` updates.
 *
 * Garanties de comptage (v2.4.63) :
 *  - rien n'est perdu sur un raté DB : un compte dont l'écriture échoue (ou
 *    tout le lot si la base est injoignable) est remis dans le buffer et
 *    retenté au flush suivant ;
 *  - écriture atomique par compte (`$transaction` : compteurs du compte +
 *    lignes ProxyUsage) — un échec partiel ne peut pas être recompté au retry ;
 *  - flush final à l'arrêt (`beforeApplicationShutdown`, nécessite
 *    `enableShutdownHooks()` dans main.ts) ;
 *  - chaque octet est daté du jour où il a été consommé, pas du flush ;
 *  - les octets pas encore écrits en base restent visibles (`getPending`) pour
 *    l'application du quota en temps réel par le moteur.
 */
@Injectable()
export class TrafficService implements OnModuleInit, BeforeApplicationShutdown {
  private readonly logger = new Logger(TrafficService.name);
  private buffer = new Map<string, UserStats>();
  /** Lot en cours d'écriture — ses octets restent "pending" jusqu'au commit. */
  private flushing: Map<string, UserStats> | null = null;
  private inFlight: Promise<void> | null = null;
  private readonly rates = new Map<string, RateRing>();
  private dayStart = 0;
  private nextDayStart = 0;
  /** Appelé après chaque commit avec le `usedGb` réel en base (cf. ProxyServerService). */
  private usageListener: ((username: string, usedGb: number) => void) | null = null;
  /** Ligne TrafficCounter garantie présente (initialisée une fois par process). */
  private counterReady = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  onModuleInit(): void {
    this.logger.log('TrafficManager initialized (interval flush every 5s).');
  }

  async beforeApplicationShutdown(): Promise<void> {
    // Le moteur a déjà coupé ses tunnels (onModuleDestroy) : leurs derniers
    // octets sont dans le buffer. Sans ce flush final, jusqu'à 5s de trafic
    // de TOUS les comptes étaient perdus à chaque redémarrage/redeploy.
    try {
      await this.flushAll();
      this.logger.log('Final traffic flush done.');
    } catch (e) {
      this.logger.error(`Final traffic flush failed: ${e}`);
    }
  }

  setUsageListener(fn: (username: string, usedGb: number) => void): void {
    this.usageListener = fn;
  }

  logTraffic(
    username: string,
    hostname: string,
    sent: number,
    received: number,
    isNewReq = false,
  ): void {
    const now = Date.now();
    if (now >= this.nextDayStart || now < this.dayStart) this.rollDay(now);

    let user = this.buffer.get(username);
    if (!user) {
      user = { sent: 0, received: 0, hosts: new Map() };
      this.buffer.set(username, user);
    }
    user.sent += sent;
    user.received += received;

    const key = `${this.dayStart}|${hostname}`;
    let host = user.hosts.get(key);
    if (!host) {
      host = { day: this.dayStart, hostname, sent: 0, received: 0, reqs: 0 };
      user.hosts.set(key, host);
    }
    host.sent += sent;
    host.received += received;
    if (isNewReq) host.reqs += 1;

    this.recordRate(username, now, sent, received);
  }

  /** Octets consommés mais pas encore écrits en base (buffer + lot en cours d'écriture). */
  getPending(username: string): { sent: number; received: number } {
    const a = this.buffer.get(username);
    const b = this.flushing?.get(username);
    return {
      sent: (a?.sent ?? 0) + (b?.sent ?? 0),
      received: (a?.received ?? 0) + (b?.received ?? 0),
    };
  }

  getPendingBytes(username: string): number {
    const a = this.buffer.get(username);
    const b = this.flushing?.get(username);
    return (a ? a.sent + a.received : 0) + (b ? b.sent + b.received : 0);
  }

  @Interval(5000)
  async scheduledFlush(): Promise<void> {
    await this.flush();
  }

  /** Lance un flush (ou rejoint celui en cours). */
  flush(): Promise<void> {
    if (!this.inFlight) {
      this.inFlight = this.doFlush().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  /**
   * Garantit que TOUT ce qui a été consommé jusqu'à maintenant est en base
   * (attend le flush en cours, puis flush le reste). Utilisé avant un reset
   * des compteurs et à l'arrêt.
   */
  async flushAll(): Promise<void> {
    if (this.inFlight) await this.inFlight;
    await this.flush();
  }

  private async doFlush(): Promise<void> {
    if (this.buffer.size === 0) return;
    // Snapshot + clear so the engine can keep accumulating during flush
    const snapshot = this.buffer;
    this.buffer = new Map();
    this.flushing = snapshot;

    try {
      try {
        await this.prisma.ensureConnection();
      } catch (e) {
        // Avant : le lot entier était jeté ici — tout le trafic de la fenêtre
        // perdu dès que la base avait un raté. Remis au buffer pour le retry.
        this.logger.error(`Cannot ensure DB connection, traffic kept for retry: ${e}`);
        for (const [username, data] of snapshot) this.requeue(username, data);
        snapshot.clear();
        return;
      }

      if (!(await this.ensureCounter())) {
        for (const [username, data] of snapshot) this.requeue(username, data);
        snapshot.clear();
        return;
      }

      const rows = await this.prisma.userProxy
        .findMany({ where: { username: { in: [...snapshot.keys()] } }, select: { id: true, username: true } })
        .catch((e) => {
          this.logger.error(`TrafficManager: cannot resolve accounts, traffic kept for retry: ${e}`);
          return null;
        });
      if (!rows) {
        for (const [username, data] of snapshot) this.requeue(username, data);
        snapshot.clear();
        return;
      }
      const idByUsername = new Map(rows.map((r) => [r.username, r.id]));

      for (const [username, data] of [...snapshot]) {
        const id = idByUsername.get(username);
        if (!id) {
          // Compte supprimé entre-temps — plus rien à qui imputer ces octets.
          snapshot.delete(username);
          continue;
        }
        try {
          await this.commitUser(snapshot, username, id, data);
        } catch (e) {
          if ((e as any)?.code === 'P2025') {
            snapshot.delete(username); // supprimé pendant le flush
          } else {
            this.logger.error(`TrafficManager: flush failed for ${username}, kept for retry: ${e}`);
            this.requeue(username, data);
            snapshot.delete(username);
          }
        }
      }
    } finally {
      this.flushing = null;
      this.pruneRates(Date.now());
    }
  }

  /**
   * Écrit les compteurs d'UN compte en une transaction (tout ou rien) : un
   * échec après la mise à jour de `usedGb` ne peut plus laisser les lignes
   * ProxyUsage de côté, ni provoquer un double comptage au retry.
   */
  private async commitUser(
    snapshot: Map<string, UserStats>,
    username: string,
    userProxyId: string,
    data: UserStats,
  ): Promise<void> {
    const totalBytes = data.sent + data.received;
    const gbIncrement = totalBytes / GiB;
    const hosts = [...data.hosts.values()];
    const reqs = hosts.reduce((n, h) => n + h.reqs, 0);

    const [updated] = await this.prisma.$transaction([
      this.prisma.userProxy.update({
        where: { id: userProxyId },
        data: {
          usedGb: { increment: gbIncrement },
          totalBytesSent: { increment: BigInt(Math.round(data.sent)) },
          totalBytesReceived: { increment: BigInt(Math.round(data.received)) },
        },
        select: { usedGb: true, totalGb: true },
      }),
      this.prisma.trafficCounter.update({
        where: { id: 'global' },
        data: {
          bytesSent: { increment: BigInt(Math.round(data.sent)) },
          bytesReceived: { increment: BigInt(Math.round(data.received)) },
          requests: { increment: BigInt(reqs) },
        },
      }),
      ...hosts.map((h) =>
        this.prisma.proxyUsage.upsert({
          where: {
            userProxyId_hostname_date: { userProxyId, hostname: h.hostname, date: new Date(h.day) },
          },
          create: {
            userProxyId,
            hostname: h.hostname,
            date: new Date(h.day),
            bytesSent: h.sent,
            bytesReceived: h.received,
            requests: h.reqs,
          },
          update: {
            bytesSent: { increment: h.sent },
            bytesReceived: { increment: h.received },
            requests: { increment: h.reqs },
          },
        }),
      ),
    ]);

    // Même tick que le commit : on publie le nouveau `usedGb` ET on retire ces
    // octets du "pending", pour que (usedGb + pending) ne compte jamais deux
    // fois — ni zéro fois — le lot qui vient d'être écrit.
    const newUsed = (updated as { usedGb: number; totalGb: number }).usedGb;
    const totalGb = (updated as { usedGb: number; totalGb: number }).totalGb;
    this.usageListener?.(username, newUsed);
    snapshot.delete(username);

    const oldUsed = newUsed - gbIncrement;
    if (totalGb > 0 && oldUsed < totalGb && newUsed >= totalGb) {
      void this.notificationService.notifyQuotaExceeded(username, newUsed, totalGb);
    }
  }

  /**
   * Crée la ligne du compteur global si absente, initialisée avec les totaux
   * actuels (somme des comptes + requêtes ProxyUsage — l'ancienne source des
   * snapshots) pour que le graphique reste continu au passage à ce compteur.
   */
  private async ensureCounter(): Promise<boolean> {
    if (this.counterReady) return true;
    try {
      const existing = await this.prisma.trafficCounter.findUnique({ where: { id: 'global' } });
      if (!existing) {
        const [bytes, requests] = await Promise.all([
          this.prisma.userProxy.aggregate({ _sum: { totalBytesSent: true, totalBytesReceived: true } }),
          this.prisma.proxyUsage.aggregate({ _sum: { requests: true } }),
        ]);
        await this.prisma.trafficCounter.upsert({
          where: { id: 'global' },
          create: {
            id: 'global',
            bytesSent: bytes._sum.totalBytesSent ?? 0n,
            bytesReceived: bytes._sum.totalBytesReceived ?? 0n,
            requests: BigInt(requests._sum.requests ?? 0),
          },
          update: {},
        });
      }
      this.counterReady = true;
      return true;
    } catch (e) {
      this.logger.error(`TrafficManager: cannot init global counter, traffic kept for retry: ${e}`);
      return false;
    }
  }

  /** Remet les stats d'un compte dans le buffer courant (retry au prochain flush). */
  private requeue(username: string, data: UserStats): void {
    let user = this.buffer.get(username);
    if (!user) {
      user = { sent: 0, received: 0, hosts: new Map() };
      this.buffer.set(username, user);
    }
    user.sent += data.sent;
    user.received += data.received;
    for (const [key, h] of data.hosts) {
      const cur = user.hosts.get(key);
      if (cur) {
        cur.sent += h.sent;
        cur.received += h.received;
        cur.reqs += h.reqs;
      } else {
        user.hosts.set(key, { ...h });
      }
    }
  }

  private rollDay(now: number): void {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    this.dayStart = d.getTime();
    d.setDate(d.getDate() + 1);
    this.nextDayStart = d.getTime();
  }

  private recordRate(username: string, now: number, sent: number, received: number): void {
    const sec = Math.floor(now / 1000);
    const i = sec % RATE_RING;
    let ring = this.rates.get(username);
    if (!ring) {
      ring = {
        secs: new Array(RATE_RING).fill(-1),
        sent: new Array(RATE_RING).fill(0),
        received: new Array(RATE_RING).fill(0),
      };
      this.rates.set(username, ring);
    }
    if (ring.secs[i] !== sec) {
      ring.secs[i] = sec;
      ring.sent[i] = 0;
      ring.received[i] = 0;
    }
    ring.sent[i] += sent;
    ring.received[i] += received;
  }

  private pruneRates(now: number): void {
    const oldest = Math.floor(now / 1000) - RATE_WINDOW_S;
    for (const [username, ring] of this.rates) {
      if (ring.secs.every((s) => s < oldest)) this.rates.delete(username);
    }
  }

  /**
   * Débit "live" par compte : moyenne sur les `RATE_WINDOW_S` dernières
   * secondes COMPLÈTES (anneau de compteurs par seconde, indépendant du
   * flush). Avant : buffer courant ÷ 5 — une dent de scie entre 0 et 100 %
   * du vrai débit selon l'instant où le dashboard interrogeait l'API.
   */
  getLiveBandwidth(): Map<string, { sentBps: number; receivedBps: number }> {
    const out = new Map<string, { sentBps: number; receivedBps: number }>();
    const nowSec = Math.floor(Date.now() / 1000);
    const from = nowSec - RATE_WINDOW_S;
    for (const [username, ring] of this.rates) {
      let sent = 0;
      let received = 0;
      for (let i = 0; i < RATE_RING; i++) {
        if (ring.secs[i] >= from && ring.secs[i] < nowSec) {
          sent += ring.sent[i];
          received += ring.received[i];
        }
      }
      if (sent || received) {
        out.set(username, { sentBps: sent / RATE_WINDOW_S, receivedBps: received / RATE_WINDOW_S });
      }
    }
    return out;
  }
}
