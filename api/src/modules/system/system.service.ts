import { Injectable, NotFoundException } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { connect } from 'net';
import { randomBytes } from 'crypto';
import { statfsSync } from 'fs';
import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from '../../config/settings.service';
import { BackupService } from '../backup/backup.service';
import { dataDir } from '../../database/db-config';
import { isCloudflareIp, isPrivateIp } from '../../common/utils/ip-range';
import { RingBufferLogger } from '../logs/ring-buffer.logger';
import * as os from 'os';
import { APP_VERSION } from '../../version';

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'info';
export interface Check {
  id: string;
  status: CheckStatus;
  /** Données brutes pour l'affichage (le texte est traduit côté panel). */
  data?: Record<string, unknown>;
}

const DEFAULT_PUBLIC_HOST = 'prx.uhq.monster';
const TESTED_KEY = '__onboarding.testOk';

function probe(host: string, port: number, timeoutMs: number): Promise<{ ok: boolean; ms: number; error?: string }> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const s = connect({ host, port });
    const done = (ok: boolean, error?: string) => {
      s.destroy();
      resolve({ ok, ms: Date.now() - t0, error });
    };
    s.setTimeout(timeoutMs, () => done(false, 'timeout'));
    s.once('connect', () => done(true));
    s.once('error', (e: NodeJS.ErrnoException) => done(false, e.code || e.message));
  });
}

/** Aides à l'ouverture du panel : checklist de démarrage, diagnostic, test de compte, état public. */
@Injectable()
export class SystemService {
  private serverIp: { ip: string | null; at: number } | null = null;
  private statusCache: { at: number; body: any } | null = null;
  private readonly enginePort = Number(process.env.PROXY_PORT ?? 990);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly backup: BackupService,
  ) {}

  // ───────────────────────── Checklist « premiers pas » ─────────────────────────

  async onboarding() {
    const host = this.settings.get('publicProxyHost').trim();
    const [backendProxies, sources, pools, accounts, twoFaAdmins, tested] = await Promise.all([
      this.prisma.backendProxy.count(),
      this.prisma.scraperSource.count(),
      this.prisma.proxyPool.count(),
      this.prisma.userProxy.count(),
      this.prisma.panelUser.count({ where: { role: 'ADMIN', totpEnabled: true } }),
      this.prisma.setting.findUnique({ where: { key: TESTED_KEY } }),
    ]);
    const backupEnabled = this.settings.getBool('backupDatabaseEnabled');
    const items = [
      { id: 'host', done: !!host && host !== DEFAULT_PUBLIC_HOST, link: '/settings?tab=proxy' },
      { id: 'pool', done: backendProxies > 0 || sources > 0, link: '/scraper' },
      { id: 'category', done: pools > 0, link: '/proxy-pools' },
      { id: 'account', done: accounts > 0, link: '/subusers' },
      { id: 'test', done: !!tested, link: '/subusers' },
      { id: 'backup', done: backupEnabled, link: '/settings?tab=backups' },
      { id: 'twofa', done: this.settings.getBool('require2faForAdmins') || twoFaAdmins > 0, link: '/security' },
    ];
    return {
      items,
      done: items.filter((i) => i.done).length,
      total: items.length,
      backup: {
        enabled: backupEnabled,
        storage: this.settings.get('backupStorageType') || 'local',
      },
      demo: await this.hasDemo(),
    };
  }

  // ───────────────────────────── Diagnostic ─────────────────────────────

  private async publicServerIp(): Promise<string | null> {
    if (this.serverIp && Date.now() - this.serverIp.at < 10 * 60_000) return this.serverIp.ip;
    let ip: string | null = null;
    try {
      const r = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(3500) });
      const txt = (await r.text()).trim();
      if (/^[0-9a-f.:]{3,45}$/i.test(txt)) ip = txt;
    } catch {
      /* hors ligne / bloqué : on ne conclut pas */
    }
    this.serverIp = { ip, at: Date.now() };
    return ip;
  }

  /** DNS / Cloudflare / adresse du serveur / port joignable pour un hôte public donné. */
  private async domainChecks(
    host: string,
    port: number,
    push: (id: string, status: CheckStatus, data?: Record<string, unknown>) => void,
  ) {
      let addresses: string[] = [];
      try {
        addresses = (await lookup(host, { all: true })).map((a) => a.address);
      } catch {
        push('dns', 'fail', { host });
      }
      if (addresses.length) {
        const cf = addresses.filter(isCloudflareIp);
        const serverIp = await this.publicServerIp();
        if (cf.length) {
          push('dns', 'fail', { host, addresses, reason: 'cloudflare' });
        } else if (addresses.every(isPrivateIp)) {
          push('dns', 'warn', { host, addresses, reason: 'private' });
        } else if (serverIp && addresses.includes(serverIp)) {
          push('dns', 'ok', { host, addresses, serverIp });
        } else {
          push('dns', serverIp ? 'warn' : 'info', { host, addresses, serverIp, reason: 'mismatch' });
        }
        // Joignabilité du port depuis le serveur lui-même (peut échouer à tort derrière certains NAT).
        const reach = await probe(host, port, 3500);
        push('portReach', reach.ok ? 'ok' : 'warn', { host, port, error: reach.error, ms: reach.ms });
      }
  }

  /**
   * Vérification AVANT la fin de l'installation (écran /setup) : le domaine saisi pointe-t-il sur ce serveur, passe-t-il par
   * Cloudflare, le port proxy est-il joignable ? Public mais verrouillé comme le reste de l'installation (jeton, installation
   * non terminée) et limité en débit.
   */
  async preflight(host: string, port: number) {
    const checks: Check[] = [];
    const push = (id: string, status: CheckStatus, data?: Record<string, unknown>) => checks.push({ id, status, data });
    const engine = await probe('127.0.0.1', this.enginePort, 1500);
    push('engine', engine.ok ? 'ok' : 'fail', { port: this.enginePort });
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      push('db', 'ok');
    } catch {
      push('db', 'fail');
    }
    const h = host.trim();
    if (!h || h === DEFAULT_PUBLIC_HOST) {
      push('publicHost', 'warn', { host: h });
    } else {
      push('publicHost', 'ok', { host: h, port });
      await this.domainChecks(h, port, push);
    }
    return { checks };
  }

  async diagnostics(req: { protocol?: string; hostname?: string }) {
    const checks: Check[] = [];
    const push = (id: string, status: CheckStatus, data?: Record<string, unknown>) => checks.push({ id, status, data });

    // Moteur proxy en écoute (local)
    const engine = await probe('127.0.0.1', this.enginePort, 1500);
    push('engine', engine.ok ? 'ok' : 'fail', { port: this.enginePort, error: engine.error });

    // Base de données
    const t0 = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      push('db', 'ok', { ms: Date.now() - t0 });
    } catch {
      push('db', 'fail');
    }

    // Domaine / hôte public
    const host = this.settings.get('publicProxyHost').trim();
    const port = this.settings.getNumber('publicProxyPort') || 990;
    if (!host || host === DEFAULT_PUBLIC_HOST) {
      push('publicHost', 'warn', { host });
    } else {
      push('publicHost', 'ok', { host, port });
      await this.domainChecks(host, port, push);
    }

    // HTTPS du panel
    const local = ['localhost', '127.0.0.1', '::1'].includes(req.hostname ?? '');
    push('https', req.protocol === 'https' || local ? 'ok' : 'warn', { protocol: req.protocol });

    // Pool de proxies
    const working = await this.prisma.backendProxy.count({ where: { isWorking: true } });
    push('pool', working > 0 ? 'ok' : 'warn', { working });

    // Disque
    try {
      const fs = statfsSync(dataDir());
      const freeGb = (Number(fs.bavail) * Number(fs.bsize)) / 1e9;
      push('disk', freeGb < 1 ? 'fail' : freeGb < 5 ? 'warn' : 'ok', { freeGb: Math.round(freeGb * 10) / 10 });
    } catch {
      push('disk', 'info');
    }

    // Sauvegardes
    if (!this.settings.getBool('backupDatabaseEnabled')) {
      push('backup', 'fail', { enabled: false });
    } else {
      let newest: number | null = null;
      try {
        const list = await this.backup.listBackups();
        for (const b of list) {
          const ts = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
          if (ts && (!newest || ts > newest)) newest = ts;
        }
      } catch {
        /* stockage injoignable */
      }
      const ageH = newest ? Math.round((Date.now() - newest) / 3_600_000) : null;
      push('backup', newest ? (ageH! > 48 ? 'warn' : 'ok') : 'warn', {
        enabled: true,
        storage: this.settings.get('backupStorageType') || 'local',
        lastAgeHours: ageH,
      });
    }

    // Sécurité
    const admins = await this.prisma.panelUser.findMany({ where: { role: 'ADMIN', isActive: true }, select: { totpEnabled: true } });
    const adminWith2fa = admins.filter((a) => a.totpEnabled).length;
    push('twofa', this.settings.getBool('require2faForAdmins') ? 'ok' : adminWith2fa === admins.length && admins.length ? 'ok' : 'warn', {
      required: this.settings.getBool('require2faForAdmins'),
      admins: admins.length,
      with2fa: adminWith2fa,
    });
    const captcha = this.settings.get('captchaProvider');
    const registration = this.settings.getBool('registrationEnabled');
    push('captcha', captcha && captcha !== 'none' ? 'ok' : registration ? 'warn' : 'info', { provider: captcha, registration });
    push('smtp', this.settings.get('smtpHost') ? 'ok' : 'info');
    if (this.settings.get('smtpHost')) {
      push('panelUrl', this.settings.get('panelUrl') ? 'ok' : 'info', { url: this.settings.get('panelUrl'), fallback: `https://${this.settings.get('publicProxyHost')}` });
    }
    push('setupToken', 'info', { set: !!process.env.SETUP_TOKEN });
    const channels = ['discord', 'slack', 'bloumechat'].filter((c) => this.settings.getBool(`${c}AlertsEnabled` as any) && this.settings.get(`${c}WebhookUrl` as any));
    const heartbeat = !!this.settings.get('heartbeatUrl').trim();
    push('alerts', !this.settings.getBool('healthAlertsEnabled') ? 'warn' : channels.length || heartbeat ? 'ok' : 'warn', {
      enabled: this.settings.getBool('healthAlertsEnabled'),
      channels: channels.join(', ') || '—',
      heartbeat,
    });

    const rank = { fail: 3, warn: 2, info: 1, ok: 0 } as const;
    const worst = checks.reduce<CheckStatus>((w, c) => (rank[c.status] > rank[w] ? c.status : w), 'ok');
    return { checks, summary: { worst, fail: checks.filter((c) => c.status === 'fail').length, warn: checks.filter((c) => c.status === 'warn').length } };
  }

  // ───────────────────────── Mode démo ─────────────────────────

  private static readonly DEMO_TAG = '__demo';

  async hasDemo(): Promise<boolean> {
    return (await this.prisma.userProxy.count({ where: { tags: { contains: SystemService.DEMO_TAG } } })) > 0;
  }

  /** Crée une catégorie et 3 comptes d'exemple avec 7 jours d'historique, pour voir un tableau de bord rempli. */
  async createDemo() {
    if (await this.hasDemo()) return { created: 0 };
    // Générateur cryptographique ; les comptes de démo sont de plus BLOQUÉS : ils ne peuvent jamais s'authentifier sur le moteur.
    const rnd = (n: number) => randomBytes(Math.ceil((n * 3) / 4) + 2).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x').slice(0, n);
    const poolName = 'Démo';
    await this.prisma.proxyPool.upsert({
      where: { name: poolName },
      update: {},
      create: { name: poolName, description: 'Données de démonstration — supprimables', color: '#8b5cf6' },
    });
    const people = [
      { name: 'Démo — Alice', totalGb: 5 },
      { name: 'Démo — Bob', totalGb: 20 },
      { name: 'Démo — Chloé', totalGb: 50 },
    ];
    const hosts = ['example.com', 'api.github.com', 'www.wikipedia.org', 'httpbin.org', 'news.ycombinator.com'];
    for (const person of people) {
      const acc = await this.prisma.userProxy.create({
        data: {
          name: person.name,
          username: `demo_${rnd(8)}`,
          password: rnd(24),
          isBlocked: true,
          totalGb: person.totalGb,
          pool: poolName,
          tags: `demo,${SystemService.DEMO_TAG}`,
        },
      });
      let sent = 0;
      let received = 0;
      const rows: { userProxyId: string; hostname: string; bytesSent: number; bytesReceived: number; requests: number; date: Date }[] = [];
      for (let d = 6; d >= 0; d--) {
        const day = new Date();
        day.setHours(12, 0, 0, 0);
        day.setDate(day.getDate() - d);
        for (const h of hosts.slice(0, 3 + Math.floor(Math.random() * 3))) {
          const s = Math.round(Math.random() * 40e6);
          const r = Math.round(Math.random() * 400e6);
          sent += s;
          received += r;
          rows.push({ userProxyId: acc.id, hostname: h, bytesSent: s, bytesReceived: r, requests: 20 + Math.floor(Math.random() * 900), date: day });
        }
      }
      await this.prisma.proxyUsage.createMany({ data: rows, skipDuplicates: true });
      await this.prisma.userProxy.update({
        where: { id: acc.id },
        data: { totalBytesSent: BigInt(sent), totalBytesReceived: BigInt(received), usedGb: (sent + received) / 1e9 },
      });
    }
    return { created: people.length };
  }

  /** Supprime les comptes de démonstration (cascade : leur historique) et la catégorie « Démo » si plus personne ne l'utilise. */
  async removeDemo() {
    const res = await this.prisma.userProxy.deleteMany({ where: { tags: { contains: SystemService.DEMO_TAG } } });
    const left = await this.prisma.userProxy.count({ where: { pool: 'Démo' } });
    if (!left) await this.prisma.proxyPool.deleteMany({ where: { name: 'Démo' } });
    return { removed: res.count };
  }

  // ───────────────────────── Infos de support ─────────────────────────

  /** Masque ce qui ne doit jamais partir dans une demande d'aide : identifiants d'URL, jetons, e-mails, fin des IP. */
  private redact(text: string): string {
    return text
      .replace(/(\w+:\/\/)[^\s/@:]+:[^\s/@]+@/g, '$1***:***@')
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1***')
      .replace(/([?&](?:token|key|password|secret|apikey)=)[^&\s]+/gi, '$1***')
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '***@***')
      .replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b/g, '$1.x');
  }

  /** Résumé collable dans une demande d'aide : version, environnement, diagnostic, réglages (sans secret), dernières erreurs. */
  async supportInfo(req: { protocol?: string; hostname?: string }) {
    const diag = await this.diagnostics(req);
    const [accounts, working, sources, pools, admins] = await Promise.all([
      this.prisma.userProxy.count(),
      this.prisma.backendProxy.count({ where: { isWorking: true } }),
      this.prisma.scraperSource.count(),
      this.prisma.proxyPool.count(),
      this.prisma.panelUser.count({ where: { role: 'ADMIN' } }),
    ]);
    const s = this.settings;
    const flags: Record<string, string | boolean> = {
      publicHostSet: !!s.get('publicProxyHost') && s.get('publicProxyHost') !== DEFAULT_PUBLIC_HOST,
      panelUrlSet: !!s.get('panelUrl'),
      backupsEnabled: s.getBool('backupDatabaseEnabled'),
      backupStorage: s.get('backupStorageType') || 'local',
      require2faForAdmins: s.getBool('require2faForAdmins'),
      captcha: s.get('captchaProvider') || 'none',
      smtpConfigured: !!s.get('smtpHost'),
      registrationEnabled: s.getBool('registrationEnabled'),
      statusPageEnabled: s.getBool('statusPageEnabled'),
      healthAlertsEnabled: s.getBool('healthAlertsEnabled'),
      heartbeatSet: !!s.get('heartbeatUrl'),
      autoUpdateConfigured: !!s.get('updateWebhookUrl'),
    };
    const logs = RingBufferLogger.getEntries({ level: 'warn', limit: 40 }).map(
      (e) => `${new Date(e.ts).toISOString().slice(11, 19)} ${e.level.toUpperCase()} [${e.context ?? ''}] ${this.redact(e.message).replace(/\s+/g, ' ').slice(0, 240)}`,
    );
    const mem = process.memoryUsage();
    const lines = [
      `## UHQ Panel OS — infos de support`,
      `- Version : ${APP_VERSION}`,
      `- Node ${process.version} · ${os.platform()} ${os.arch()} · uptime ${Math.round(process.uptime() / 60)} min · RAM ${Math.round(mem.rss / 1048576)} Mo`,
      `- Comptes proxy : ${accounts} · Proxies fonctionnels : ${working} · Sources : ${sources} · Catégories : ${pools} · Admins : ${admins}`,
      ``,
      `### Diagnostic (${diag.summary.fail} problème(s), ${diag.summary.warn} à surveiller)`,
      ...diag.checks.map((c) => `- [${c.status.toUpperCase()}] ${c.id}${c.data ? ' ' + this.redact(JSON.stringify(c.data)) : ''}`),
      ``,
      `### Réglages (sans secrets)`,
      ...Object.entries(flags).map(([k, v]) => `- ${k}: ${v}`),
      ``,
      `### Dernières alertes et erreurs (masquées)`,
      ...(logs.length ? logs : ['(aucune)']),
    ];
    return { text: lines.join('\n') };
  }

  // ───────────────────────── Test d'un compte proxy ─────────────────────────

  /** Requête réelle via le moteur proxy avec les identifiants du compte → IP de sortie, pays, latence. */
  async testAccount(id: string) {
    const acc = await this.prisma.userProxy.findUnique({ where: { id } });
    if (!acc) throw new NotFoundException('Account not found');
    // Pré-diagnostic : le moteur répond « 407 » pour TOUS ces cas — on les distingue ici pour donner la vraie cause.
    const preflight = (reason: string) => ({ ok: false, ms: 0, reason, port: acc.port ?? null });
    if (acc.isBlocked) return preflight('blocked');
    if (acc.expiresAt && acc.expiresAt.getTime() < Date.now()) return preflight('expired');
    if (acc.totalGb > 0 && acc.usedGb >= acc.totalGb) return preflight('quota');
    if (acc.ipWhitelist && acc.ipWhitelist.trim() !== '*') {
      const wl = acc.ipWhitelist.split(',').map((s) => s.trim());
      if (!wl.some((ip) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip))) return preflight('ipWhitelist');
    }
    // Port : dédié au compte, sinon dédié à sa catégorie (le moteur refuse sa catégorie sur un autre port), sinon global.
    let poolPort: number | null = null;
    if (acc.pool) {
      poolPort = (await this.prisma.proxyPool.findUnique({ where: { name: acc.pool }, select: { port: true } }))?.port ?? null;
    }
    const port = acc.port ?? poolPort ?? this.enginePort;
    const auth = Buffer.from(`${acc.username}:${acc.password}`).toString('base64');
    const target = 'http://ip-api.com/json/?fields=status,query,country,countryCode,isp';
    const t0 = Date.now();

    const raw = await new Promise<{ head: string; body: string } | { error: string }>((resolve) => {
      let buf = Buffer.alloc(0);
      const s = connect({ host: '127.0.0.1', port });
      const fin = (v: { head: string; body: string } | { error: string }) => {
        s.destroy();
        resolve(v);
      };
      s.setTimeout(20_000, () => fin({ error: 'timeout' }));
      s.once('connect', () =>
        s.write(`GET ${target} HTTP/1.0\r\nHost: ip-api.com\r\nProxy-Authorization: Basic ${auth}\r\nUser-Agent: uhq-panel-test\r\nConnection: close\r\n\r\n`),
      );
      s.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        if (buf.length > 64_000) fin({ error: 'toolarge' });
      });
      s.once('error', (e: NodeJS.ErrnoException) => fin({ error: e.code || e.message }));
      s.once('close', () => {
        const txt = buf.toString('utf8');
        const i = txt.indexOf('\r\n\r\n');
        fin(i < 0 ? { head: txt, body: '' } : { head: txt.slice(0, i), body: txt.slice(i + 4) });
      });
    });
    const ms = Date.now() - t0;

    if ('error' in raw) return { ok: false, ms, error: raw.error, port };
    const status = Number((raw.head.match(/^HTTP\/\d\.\d\s+(\d{3})/) ?? [])[1] ?? 0);
    if (status !== 200) return { ok: false, ms, status, port };
    let info: any = null;
    try {
      info = JSON.parse(raw.body.slice(raw.body.indexOf('{'), raw.body.lastIndexOf('}') + 1));
    } catch {
      /* corps illisible */
    }
    if (!info || info.status !== 'success') return { ok: false, ms, status, port, error: 'badresponse' };

    await this.prisma.setting
      .upsert({ where: { key: TESTED_KEY }, create: { key: TESTED_KEY, value: '1' }, update: { value: '1' } })
      .catch(() => undefined);
    return { ok: true, ms, status, port, ip: info.query, country: info.country, countryCode: info.countryCode, isp: info.isp };
  }

  // ───────────────────────────── État public ─────────────────────────────

  /** Page d'état publique (désactivée par défaut) : volontairement sans aucun chiffre ni détail interne. */
  async publicStatus() {
    if (!this.settings.getBool('statusPageEnabled')) throw new NotFoundException();
    if (this.statusCache && Date.now() - this.statusCache.at < 15_000) return this.statusCache.body;

    let dbOk = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      /* indisponible */
    }
    const engine = (await probe('127.0.0.1', this.enginePort, 1500)).ok;
    let poolOk = false;
    if (dbOk) poolOk = (await this.prisma.backendProxy.count({ where: { isWorking: true } })) > 0;

    const overall = !dbOk || !engine ? 'outage' : poolOk ? 'operational' : 'degraded';
    const body = {
      status: overall,
      updatedAt: new Date().toISOString(),
      message: this.settings.get('statusPageMessage').slice(0, 500),
      siteName: this.settings.get('siteName'),
      components: [
        { id: 'panel', ok: dbOk },
        { id: 'proxy', ok: engine },
        { id: 'pool', ok: poolOk },
      ],
    };
    this.statusCache = { at: Date.now(), body };
    return body;
  }
}

