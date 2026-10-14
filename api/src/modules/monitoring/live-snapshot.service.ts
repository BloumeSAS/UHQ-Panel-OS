import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ProxyServerService } from '../proxy-engine/proxy-server.service';
import { TrafficService } from '../traffic/traffic.service';
import { BYTES_PER_GB } from '../../common/utils/units';

export interface LiveSnapshot {
  seq: number;
  ts: string;
  live: { active_threads: number; active_sessions: number; pool: { total: number; working: number; banned: number } };
  active_accounts: Array<{
    username: string;
    label: string;
    pool: string | null;
    threads: number;
    threadsLimit: number | null;
    sentBps: number;
    receivedBps: number;
    totalBytesSent: number | null;
    totalBytesReceived: number | null;
    totalGb: number | null;
    usedGb: number | null;
  }>;
  active_proxies: ReturnType<ProxyServerService['getActiveUpstreamProxies']>;
  today_summary: { total_gb: number; total_requests: number; top_domains: { hostname: string; requests: number }[] };
  /** Clés historiques (compat. consommateurs existants du flux WebSocket). */
  activeThreads: number;
  activeSessions: number;
  poolTotal: number;
  poolWorking: number;
  poolBanned: number;
  timestamp: string;
}

interface UserMeta {
  label: string;
  pool: string | null;
  threadsLimit: number | null;
  totalBytesSent: number;
  totalBytesReceived: number;
  totalGb: number;
  usedGb: number;
  at: number;
}

/**
 * UNE seule source pour tout ce que le tableau de bord montre « en direct » (threads, sessions, comptes actifs,
 * proxies utilisés, pool, consommation du jour). Tout est calculé dans le même passage, depuis le même état du
 * moteur : le nombre de threads d'une carte est donc toujours égal à la somme des comptes listés. Les parties
 * qui coûtent une requête SQL sont mises en cache quelques secondes ; le reste (mémoire du moteur) est frais
 * à chaque instantané. Partagé par le flux WebSocket et l'API HTTP de secours.
 */
@Injectable()
export class LiveSnapshotService {
  private seq = 0;
  private memo: { at: number; snap: LiveSnapshot } | null = null;
  private inflight: Promise<LiveSnapshot> | null = null;

  private pool: { at: number; total: number; working: number; banned: number } | null = null;
  private today: { at: number; bytes: number; requests: number; top: { hostname: string; requests: number }[] } | null = null;
  private readonly users = new Map<string, UserMeta>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ProxyServerService,
    private readonly traffic: TrafficService,
  ) {}

  /** Instantané courant (mémoïsé ~1 s : N clients connectés = 1 calcul). */
  async get(): Promise<LiveSnapshot> {
    if (this.memo && Date.now() - this.memo.at < 900) return this.memo.snap;
    if (!this.inflight) {
      this.inflight = this.build()
        .then((snap) => {
          this.memo = { at: Date.now(), snap };
          return snap;
        })
        .finally(() => {
          this.inflight = null;
        });
    }
    return this.inflight;
  }

  private async poolCounts() {
    if (this.pool && Date.now() - this.pool.at < 4000) return this.pool;
    const [total, working, banned] = await Promise.all([
      this.prisma.backendProxy.count(),
      this.prisma.backendProxy.count({ where: { isWorking: true, isBlacklisted: false } }),
      this.prisma.backendProxy.count({ where: { isBlacklisted: true } }),
    ]);
    this.pool = { at: Date.now(), total, working, banned };
    return this.pool;
  }

  private async todayBase() {
    if (this.today && Date.now() - this.today.at < 15_000) return this.today;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [totals, groups] = await Promise.all([
      this.prisma.proxyUsage.aggregate({
        where: { date: { gte: start } },
        _sum: { bytesSent: true, bytesReceived: true, requests: true },
      }),
      this.prisma.proxyUsage.groupBy({
        by: ['hostname'],
        where: { date: { gte: start } },
        _sum: { requests: true },
        orderBy: { _sum: { requests: 'desc' } },
        take: 10,
      }),
    ]);
    this.today = {
      at: Date.now(),
      bytes: (totals._sum.bytesSent ?? 0) + (totals._sum.bytesReceived ?? 0),
      requests: totals._sum.requests ?? 0,
      top: groups.map((g) => ({ hostname: g.hostname, requests: g._sum.requests ?? 0 })),
    };
    return this.today;
  }

  private async userMeta(usernames: string[]) {
    const stale = usernames.filter((u) => {
      const m = this.users.get(u);
      return !m || Date.now() - m.at > 5000;
    });
    if (stale.length) {
      const rows = await this.prisma.userProxy.findMany({
        where: { username: { in: stale } },
        select: {
          username: true,
          name: true,
          pool: true,
          threadsLimit: true,
          totalBytesSent: true,
          totalBytesReceived: true,
          totalGb: true,
          usedGb: true,
        },
      });
      for (const r of rows) {
        this.users.set(r.username, {
          label: r.name ?? r.username,
          pool: r.pool ?? null,
          threadsLimit: r.threadsLimit ?? null,
          totalBytesSent: Number(r.totalBytesSent),
          totalBytesReceived: Number(r.totalBytesReceived),
          totalGb: r.totalGb,
          usedGb: r.usedGb,
          at: Date.now(),
        });
      }
      // Nettoyage : on ne garde pas indéfiniment des comptes qui ne sont plus actifs.
      if (this.users.size > 2000) for (const [k, v] of this.users) if (Date.now() - v.at > 60_000) this.users.delete(k);
    }
    return this.users;
  }

  private async build(): Promise<LiveSnapshot> {
    // État du moteur lu UNE fois : threads, sessions, bande passante.
    const threadsMap = this.engine.getActiveThreads();
    const sessions = this.engine.getSessions().size;
    const bandwidth = this.traffic.getLiveBandwidth();
    const activeProxies = this.engine.getActiveUpstreamProxies();
    const activeUsernames = Array.from(threadsMap.keys()).filter((u) => (threadsMap.get(u) ?? 0) > 0);
    const threads = activeUsernames.reduce((n, u) => n + (threadsMap.get(u) ?? 0), 0);

    const [pool, today, metas] = await Promise.all([this.poolCounts(), this.todayBase(), this.userMeta(activeUsernames)]);

    const accounts = activeUsernames
      .map((username) => {
        const m = metas.get(username);
        const bw = bandwidth.get(username);
        const pending = this.traffic.getPending(username);
        return {
          username,
          label: m?.label ?? username,
          pool: m?.pool ?? null,
          threads: threadsMap.get(username) ?? 0,
          threadsLimit: m?.threadsLimit ?? null,
          sentBps: Math.round(bw?.sentBps ?? 0),
          receivedBps: Math.round(bw?.receivedBps ?? 0),
          // Totaux « live » : base + octets pas encore écrits en base.
          totalBytesSent: m ? m.totalBytesSent + pending.sent : null,
          totalBytesReceived: m ? m.totalBytesReceived + pending.received : null,
          totalGb: m?.totalGb ?? null,
          usedGb: m ? m.usedGb + (pending.sent + pending.received) / BYTES_PER_GB : null,
        };
      })
      .sort((a, b) => b.threads - a.threads);

    // Consommation du jour = base (SQL, cache 15 s) + octets déjà comptés mais pas encore écrits : plus de retard.
    const totalGb = (today.bytes + this.traffic.getPendingTotal()) / BYTES_PER_GB;
    const ts = new Date().toISOString();
    return {
      seq: ++this.seq,
      ts,
      live: { active_threads: threads, active_sessions: sessions, pool: { total: pool.total, working: pool.working, banned: pool.banned } },
      active_accounts: accounts,
      active_proxies: activeProxies,
      today_summary: {
        total_gb: Math.round(totalGb * 10000) / 10000,
        total_requests: today.requests,
        top_domains: today.top,
      },
      activeThreads: threads,
      activeSessions: sessions,
      poolTotal: pool.total,
      poolWorking: pool.working,
      poolBanned: pool.banned,
      timestamp: ts,
    };
  }
}
