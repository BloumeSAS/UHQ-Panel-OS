import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ChildProcess, execFile, spawn } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from '../../config/settings.service';
import { ParsedVpn, VpnKind, parseSubscription, parseVpnText, protocolLabel, singBoxConfig } from './configs';
import { isPrivateIp } from '../../common/utils/ip-range';
import * as dns from 'dns/promises';
import { startSocksServer } from './socks-server';
import { fetchVpnGate, pickVpnGate } from './vpngate';

type State = 'starting' | 'up' | 'down' | 'error';

interface Tunnel {
  id: string;
  kind: VpnKind;
  config: string;
  slot: number;
  state: State;
  error?: string;
  port?: number;
  exitIp?: string;
  latencyMs?: number;
  startedAt?: number;
  lastCheck?: number;
  fails: number;
  nextTryAt: number;
  proc?: ChildProcess;
  socks?: net.Server;
  tunIp?: string;
  dev?: string;
  log: string[];
}

export interface VpnSource {
  id: string;
  provider: 'vpngate' | 'url';
  countries: string[];
  perCountry: number;
  pool: string;
  enabled: boolean;
  /** provider « url » : page / liste / abonnement publiant des configurations en clair (https). */
  url?: string;
  /** provider « url » : nombre maximum de VPN gardés pour cette source. */
  max?: number;
}

/** URL unique d'un VPN (dédoublonnage) — identique pour une même configuration. */
export function vpnUrlOf(it: { kind: string; host: string; port: number; config: string }): string {
  const hash = crypto.createHash('sha1').update(it.config).digest('hex').slice(0, 8);
  return `vpn://${it.kind}/${it.host}:${it.port}/${hash}`;
}

/** Récupère un texte (https uniquement, ≤ 15 Mo, adresses publiques seulement, redirections revérifiées) : jamais d'accès au réseau interne. */
export async function fetchPublicText(startUrl: string): Promise<string> {
  let url = startUrl;
  for (let hop = 0; hop < 4; hop++) {
    const u = new URL(url);
    if (u.protocol !== 'https:') throw new Error('URL https requise');
    const addrs = await dns.lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address) || a.address === '127.0.0.1' || a.address === '::1' || /^(fe80|fc|fd)/i.test(a.address) || a.address.startsWith('169.254.'))) {
      throw new Error('adresse non publique refusée');
    }
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'Mozilla/5.0 UHQ-Panel', Accept: 'text/plain,text/html,*/*' } });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location')!, url).toString();
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 15_000_000) throw new Error("réponse trop volumineuse");
    return buf.toString('utf8');
  }
  throw new Error('trop de redirections');
}

const HELPER = '/usr/local/bin/uhq-vpn-helper';
/** Commande privilégiée : uniquement l'aide validée (sudo), jamais un binaire arbitraire. */
const helper = (args: string[], timeout = 8000) => run('sudo', ['-n', HELPER, ...args], timeout);

const run = (cmd: string, args: string[], timeout = 8000): Promise<{ ok: boolean; out: string }> =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout}${stderr}`.trim() }));
  });

/** Sonde l'IP de sortie à travers un SOCKS5 local : renvoie code pays + IP + latence. */
function probeThroughSocks(port: number, timeoutMs = 15000): Promise<{ country: string; ip: string; ms: number }> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const s = net.connect({ host: '127.0.0.1', port });
    const timer = setTimeout(() => {
      s.destroy();
      reject(new Error('timeout'));
    }, timeoutMs);
    const fail = (e: Error) => {
      clearTimeout(timer);
      s.destroy();
      reject(e);
    };
    let stage = 0;
    let buf = Buffer.alloc(0);
    s.on('error', fail);
    s.on('connect', () => s.write(Buffer.from([5, 1, 0])));
    s.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (stage === 0 && buf.length >= 2) {
        if (buf[1] !== 0) return fail(new Error('socks refused'));
        buf = buf.subarray(2);
        stage = 1;
        const host = Buffer.from('ip-api.com');
        s.write(Buffer.concat([Buffer.from([5, 1, 0, 3, host.length]), host, Buffer.from([0, 80])]));
      }
      if (stage === 1 && buf.length >= 10) {
        if (buf[1] !== 0) return fail(new Error(`socks connect failed (${buf[1]})`));
        buf = Buffer.alloc(0);
        stage = 2;
        s.write('GET /line?fields=countryCode,query HTTP/1.1\r\nHost: ip-api.com\r\nConnection: close\r\n\r\n');
      } else if (stage === 2) {
        const txt = buf.toString('utf8');
        const body = txt.split('\r\n\r\n')[1];
        if (body !== undefined && /\n/.test(body.trim() ? body : '') ) {
          const [cc, ip] = body.trim().split(/\r?\n/);
          if (ip) {
            clearTimeout(timer);
            s.destroy();
            return resolve({ country: (cc || '').trim().toUpperCase(), ip: ip.trim(), ms: Date.now() - t0 });
          }
        }
      }
    });
    s.on('close', () => {
      if (stage === 2) {
        const body = buf.toString('utf8').split('\r\n\r\n')[1]?.trim() ?? '';
        const [cc, ip] = body.split(/\r?\n/);
        if (ip) {
          clearTimeout(timer);
          return resolve({ country: (cc || '').trim().toUpperCase(), ip: ip.trim(), ms: Date.now() - t0 });
        }
      }
      fail(new Error('no answer'));
    });
  });
}

/**
 * Gestionnaire de tunnels VPN. Chaque ligne BackendProxy avec `vpnKind` est un VPN qui devient un proxy SOCKS5 LOCAL (127.0.0.1:port) :
 *  - OpenVPN : tunnel noyau (nécessite NET_ADMIN + /dev/net/tun) ; routage par adresse SOURCE → le serveur SOCKS lie ses connexions
 *    à l'IP du tunnel, ce qui permet plusieurs tunnels simultanés avec chacun SON IP de sortie ;
 *  - WireGuard / V2Ray (vless, vmess, trojan, ss, hysteria2) : sing-box, en espace utilisateur, sans privilèges.
 * Le moteur ne connaît que des proxies : il demande `endpointFor(id)` pour savoir où se connecter.
 */
@Injectable()
export class VpnService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VpnService.name);
  private readonly tunnels = new Map<string, Tunnel>();
  private timer?: NodeJS.Timeout;
  private syncTimer?: NodeJS.Timeout;
  private busy = false;
  private caps: { at: number; value: Record<string, any> } | null = null;
  private readonly dir = path.join(process.env.DATA_DIR || os.tmpdir(), 'vpn');

  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService) {}

  onModuleInit() {
    try {
      fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    } catch (e) {
      this.logger.warn(`Dossier VPN inaccessible (${this.dir}) : ${(e as Error).message}`);
    }
    // Premier passage après le démarrage (base prête), puis toutes les 15 s ; resynchronisation des sources toutes les 30 min.
    setTimeout(() => void this.tick(), 20_000).unref();
    this.timer = setInterval(() => void this.tick(), 15_000);
    this.timer.unref();
    this.syncTimer = setInterval(() => void this.syncSources().catch((e) => this.logger.warn(`Sources VPN : ${e.message}`)), 30 * 60_000);
    this.syncTimer.unref();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.syncTimer) clearInterval(this.syncTimer);
    await Promise.all([...this.tunnels.keys()].map((id) => this.stop(id)));
  }

  // ───────────────────────────── Capacités ─────────────────────────────

  async capabilities(force = false) {
    if (!force && this.caps && Date.now() - this.caps.at < 60_000) return this.caps.value;
    const which = async (bin: string) => (await run('sh', ['-c', `command -v ${bin}`])).ok;
    const tun = fs.existsSync('/dev/net/tun');
    const [openvpn, singbox] = await Promise.all([which('openvpn'), which('sing-box')]);
    const netAdmin = fs.existsSync(HELPER) && (await helper(['probe'])).ok;
    const value = {
      openvpn: openvpn && tun && netAdmin,
      singbox,
      details: { openvpnBinary: openvpn, tunDevice: tun, netAdmin, singboxBinary: singbox },
      maxTunnels: this.settings.getNumber('vpnMaxTunnels'),
    };
    this.caps = { at: Date.now(), value };
    return value;
  }

  // ───────────────────────────── API pour le moteur ─────────────────────────────

  /** Où se connecter pour utiliser ce VPN (SOCKS5 local), ou null s'il n'est pas prêt. */
  endpointFor(id: string): { host: string; port: number } | null {
    const t = this.tunnels.get(id);
    return t && t.state === 'up' && t.port ? { host: '127.0.0.1', port: t.port } : null;
  }

  states() {
    return [...this.tunnels.values()].map((t) => ({
      id: t.id, kind: t.kind, state: t.state, error: t.error, exitIp: t.exitIp, latencyMs: t.latencyMs, startedAt: t.startedAt, fails: t.fails,
    }));
  }

  // ───────────────────────────── Import ─────────────────────────────

  /** Crée (ou ignore si déjà présent) les lignes de proxies correspondantes. Renvoie le nombre de nouveaux VPN. */
  async importConfigs(
    items: (ParsedVpn & { country?: string })[],
    opts: { pool?: string | null; provider: string; sourceId?: string },
  ): Promise<number> {
    let created = 0;
    for (const it of items) {
      const url = vpnUrlOf(it);
      const exists = await this.prisma.backendProxy.findUnique({ where: { url }, select: { id: true } });
      if (exists) continue;
      await this.prisma.backendProxy.create({
        data: {
          id: crypto.randomUUID(),
          url,
          protocol: protocolLabel(it.kind, it.config),
          ip: it.host,
          port: it.port,
          country: it.country?.toUpperCase() || null,
          provider: opts.provider,
          pool: opts.pool || null,
          isWorking: false,
          vpnKind: it.kind,
          vpnConfig: it.config,
          tags: opts.sourceId ? `vpnsrc:${opts.sourceId}` : null,
        },
      });
      created += 1;
    }
    return created;
  }

  /** Aperçu d'une source URL : combien de configurations par type (sans rien importer). */
  async previewUrl(url: string) {
    const parsed = parseSubscription(await fetchPublicText(url));
    const byKind: Record<string, number> = {};
    for (const p of parsed) {
      const k = protocolLabel(p.kind, p.config);
      byKind[k] = (byKind[k] ?? 0) + 1;
    }
    return { total: parsed.length, byKind, sample: parsed.slice(0, 5).map((p) => `${protocolLabel(p.kind, p.config)} ${p.host}:${p.port}`) };
  }

  async syncOneUrl(url: string, max: number, pool: string | null, sourceId?: string): Promise<number> {
    const items = parseSubscription(await fetchPublicText(url)).slice(0, max);
    return this.importConfigs(items, { pool, provider: 'VPN', sourceId });
  }

  async importText(text: string, opts: { pool?: string | null; country?: string }) {
    const parsed = parseVpnText(text);
    const n = await this.importConfigs(parsed.map((p) => ({ ...p, country: opts.country })), { pool: opts.pool, provider: 'VPN' });
    return { parsed: parsed.length, imported: n };
  }

  // ───────────────────────────── Sources automatiques ─────────────────────────────

  getSources(): VpnSource[] {
    try {
      const v = JSON.parse(this.settings.get('vpnSources') || '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  async setSources(list: VpnSource[]) {
    const clean = list.slice(0, 20).map((s) => ({
      id: String(s.id || crypto.randomUUID()).slice(0, 40),
      provider: (s.provider === 'url' ? 'url' : 'vpngate') as 'vpngate' | 'url',
      url: s.provider === 'url' ? String(s.url ?? '').slice(0, 500) : undefined,
      max: Math.min(200, Math.max(1, Number(s.max) || 20)),
      countries: (s.countries ?? []).map((c) => String(c).toUpperCase().slice(0, 2)).filter(Boolean).slice(0, 60),
      perCountry: Math.min(20, Math.max(1, Number(s.perCountry) || 3)),
      pool: String(s.pool ?? '').slice(0, 80),
      enabled: s.enabled !== false,
    }));
    await this.settings.setMany({ vpnSources: JSON.stringify(clean) } as any);
    return clean;
  }

  /** Ajoute les nouveaux meilleurs serveurs de chaque source et retire ceux de la source qui ne répondent plus. */
  async syncSources(): Promise<{ added: number; removed: number }> {
    let added = 0;
    let removed = 0;
    const sources = this.getSources().filter((s) => s.enabled);
    if (sources.length === 0) return { added, removed };
    let gate: Awaited<ReturnType<typeof fetchVpnGate>> | null = null;
    for (const src of sources) {
      try {
        let items: (ParsedVpn & { country?: string })[];
        let provider: string;
        if (src.provider === 'url') {
          provider = 'VPN';
          const parsed = parseSubscription(await fetchPublicText(String(src.url)));
          items = parsed.slice(0, src.max ?? 20);
        } else {
          provider = 'VPNGate';
          gate = gate ?? (await fetchVpnGate(true));
          items = pickVpnGate(gate, src.countries, src.perCountry).map((s) => ({ kind: 'openvpn' as const, config: s.config, host: s.ip, port: s.port, country: s.countryCode }));
        }
        added += await this.importConfigs(items, { pool: src.pool || null, provider, sourceId: src.id });
        const keep = new Set(items.map((i) => vpnUrlOf(i)));
        const mine = await this.prisma.backendProxy.findMany({ where: { tags: `vpnsrc:${src.id}` }, select: { id: true, url: true, isWorking: true } });
        for (const row of mine) {
          if (!keep.has(row.url) && !row.isWorking) {
            await this.prisma.backendProxy.delete({ where: { id: row.id } }).catch(() => undefined);
            removed += 1;
          }
        }
      } catch (e) {
        this.logger.warn(`Source VPN ${src.id} : ${(e as Error).message}`);
      }
    }
    if (added || removed) this.logger.log(`Sources VPN synchronisées : +${added} / -${removed}`);
    return { added, removed };
  }

  // ───────────────────────────── Supervision ─────────────────────────────

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.reconcile();
    } catch (e) {
      this.logger.warn(`Supervision VPN : ${(e as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  private async reconcile() {
    const caps = await this.capabilities();
    const max = Math.max(0, this.settings.getNumber('vpnMaxTunnels'));
    const rows = await this.prisma.backendProxy.findMany({
      where: { vpnKind: { not: null }, archived: false, isBlacklisted: false },
      select: { id: true, vpnKind: true, vpnConfig: true, country: true, isWorking: true, protocol: true },
      orderBy: [{ isWorking: 'desc' }, { lastChecked: 'desc' }],
      take: max,
    });
    const wanted = new Map(rows.filter((r) => r.vpnConfig).map((r) => [r.id, r]));
    // Les lignes créées avant la 2.9.3 affichaient « socks5 » : on y met le vrai protocole du VPN.
    for (const r of rows) {
      if (r.vpnConfig && r.protocol === 'socks5') {
        await this.prisma.backendProxy.update({ where: { id: r.id }, data: { protocol: protocolLabel(r.vpnKind as VpnKind, r.vpnConfig) } }).catch(() => undefined);
      }
    }

    for (const id of [...this.tunnels.keys()]) if (!wanted.has(id)) await this.stop(id);

    let started = 0;
    for (const [id, row] of wanted) {
      let t = this.tunnels.get(id);
      const kind = row.vpnKind as VpnKind;
      if (!t) {
        t = { id, kind, config: row.vpnConfig!, slot: this.freeSlot(), state: 'down', fails: 0, nextTryAt: 0, log: [] };
        this.tunnels.set(id, t);
      }
      if (t.state === 'up') {
        if (!t.lastCheck || Date.now() - t.lastCheck > 60_000) await this.health(t, row.country);
        continue;
      }
      if (t.state === 'starting' || Date.now() < t.nextTryAt || started >= 2) continue;
      if (kind === 'openvpn' && !caps.openvpn) {
        t.error = 'OpenVPN indisponible dans ce conteneur (NET_ADMIN et /dev/net/tun requis)';
        t.state = 'error';
        t.nextTryAt = Date.now() + 5 * 60_000;
        await this.mark(id, false, undefined, undefined, undefined);
        continue;
      }
      if (kind !== 'openvpn' && !caps.singbox) {
        t.error = 'sing-box absent de cette image';
        t.state = 'error';
        t.nextTryAt = Date.now() + 5 * 60_000;
        continue;
      }
      started += 1;
      void this.start(t, row.country);
    }
  }

  private freeSlot(): number {
    const used = new Set([...this.tunnels.values()].map((t) => t.slot));
    let i = 0;
    while (used.has(i)) i += 1;
    return i;
  }

  private async mark(id: string, working: boolean, ms?: number, country?: string | null, rowCountry?: string | null) {
    await this.prisma.backendProxy
      .update({
        where: { id },
        data: {
          isWorking: working,
          lastChecked: new Date(),
          ...(working ? { failCount: 0, successCount: { increment: 1 }, ...(ms != null ? { averageLatency: ms } : {}) } : { failCount: { increment: 1 } }),
          ...(working && country && !rowCountry ? { country } : {}),
        },
      })
      .catch(() => undefined);
  }

  private async health(t: Tunnel, rowCountry: string | null) {
    t.lastCheck = Date.now();
    if (!t.port) return;
    try {
      const r = await probeThroughSocks(t.port);
      t.exitIp = r.ip;
      t.latencyMs = r.ms;
      await this.mark(t.id, true, r.ms, r.country, rowCountry);
    } catch (e) {
      t.fails += 1;
      this.logger.warn(`VPN ${t.id.slice(0, 8)} injoignable (${(e as Error).message}) — essai ${t.fails}`);
      if (t.fails >= 3) {
        await this.stop(t.id, true);
        t.error = 'ne répond plus';
        t.state = 'error';
        t.nextTryAt = Date.now() + Math.min(10 * 60_000, 30_000 * 2 ** Math.min(t.fails, 5));
        await this.mark(t.id, false);
      }
    }
  }

  private async start(t: Tunnel, rowCountry: string | null) {
    t.state = 'starting';
    t.error = undefined;
    t.log = [];
    try {
      if (t.kind === 'openvpn') await this.startOpenVpn(t);
      else await this.startSingBox(t);
      t.startedAt = Date.now();
      const r = await probeThroughSocks(t.port!);
      t.exitIp = r.ip;
      t.latencyMs = r.ms;
      t.state = 'up';
      t.fails = 0;
      t.lastCheck = Date.now();
      await this.mark(t.id, true, r.ms, r.country, rowCountry);
      this.logger.log(`VPN ${t.kind} ${t.id.slice(0, 8)} actif — IP de sortie ${r.ip} (${r.country}) en ${r.ms} ms`);
    } catch (e) {
      const msg = (e as Error).message;
      t.fails += 1;
      t.error = (t.log.filter((l) => /error|fail|refused|timeout|denied|AUTH/i.test(l)).pop() || msg).slice(0, 200);
      this.logger.warn(`VPN ${t.kind} ${t.id.slice(0, 8)} : démarrage échoué (${t.error})`);
      await this.stop(t.id, true);
      t.state = 'error';
      t.nextTryAt = Date.now() + Math.min(15 * 60_000, 60_000 * 2 ** Math.min(t.fails, 4));
      await this.mark(t.id, false);
    }
  }

  private pushLog(t: Tunnel, chunk: Buffer) {
    for (const l of chunk.toString('utf8').split('\n')) {
      const s = l.trim();
      if (s) t.log.push(s.slice(0, 300));
    }
    if (t.log.length > 40) t.log.splice(0, t.log.length - 40);
  }

  // ───────────────────────────── OpenVPN ─────────────────────────────

  private async startOpenVpn(t: Tunnel) {
    const dev = `uvpn${t.slot}`;
    const table = 200 + t.slot;
    const file = path.join(this.dir, `${t.id}.ovpn`);
    fs.writeFileSync(file, t.config, { mode: 0o600 });
    const proc = spawn('sudo', ['-n', HELPER, 'openvpn', t.id, dev], { stdio: ['ignore', 'pipe', 'pipe'] });
    t.proc = proc;
    t.dev = dev;
    proc.stdout.on('data', (d) => this.pushLog(t, d));
    proc.stderr.on('data', (d) => this.pushLog(t, d));
    proc.on('exit', () => {
      if (t.proc === proc && t.state === 'up') {
        t.state = 'down';
        t.error = 'tunnel fermé';
        void this.mark(t.id, false);
      }
    });
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('tunnel : délai dépassé')), 45_000);
      const check = setInterval(() => {
        const joined = t.log.join('\n');
        if (/Initialization Sequence Completed/.test(joined)) {
          clearInterval(check);
          clearTimeout(deadline);
          resolve();
        } else if (proc.exitCode !== null) {
          clearInterval(check);
          clearTimeout(deadline);
          reject(new Error(t.log.slice(-1)[0] || 'openvpn arrêté'));
        }
      }, 500);
    });
    const addr = (os.networkInterfaces()[dev] ?? []).find((i) => i.family === 'IPv4')?.address;
    if (!addr) throw new Error('adresse du tunnel introuvable');
    t.tunIp = addr;
    const r1 = await helper(['rule-add', addr, String(table), String(1000 + t.slot)]);
    const r2 = await helper(['route-add', dev, String(table)]);
    if (!r1.ok || !r2.ok) throw new Error(`routage : ${(r1.out || r2.out).slice(0, 120)}`);
    const { server, port } = await startSocksServer(addr);
    t.socks = server;
    t.port = port;
  }

  // ───────────────────────────── sing-box ─────────────────────────────

  private async startSingBox(t: Tunnel) {
    // Port libre éphémère.
    const port = await new Promise<number>((resolve, reject) => {
      const s = net.createServer();
      s.once('error', reject);
      s.listen(0, '127.0.0.1', () => {
        const p = (s.address() as net.AddressInfo).port;
        s.close(() => resolve(p));
      });
    });
    const file = path.join(this.dir, `${t.id}.json`);
    fs.writeFileSync(file, JSON.stringify(singBoxConfig(t.kind, t.config, port)), { mode: 0o600 });
    const check = await run('sing-box', ['check', '-c', file], 15000);
    if (!check.ok) throw new Error(`configuration invalide : ${check.out.slice(0, 160)}`);
    const proc = spawn('sing-box', ['run', '-c', file], { stdio: ['ignore', 'pipe', 'pipe'] });
    t.proc = proc;
    proc.stdout.on('data', (d) => this.pushLog(t, d));
    proc.stderr.on('data', (d) => this.pushLog(t, d));
    proc.on('exit', () => {
      if (t.proc === proc && t.state === 'up') {
        t.state = 'down';
        t.error = 'sing-box arrêté';
        void this.mark(t.id, false);
      }
    });
    // Attend l'ouverture du port d'entrée.
    const deadline = Date.now() + 15_000;
    for (;;) {
      if (proc.exitCode !== null) throw new Error(t.log.slice(-1)[0] || 'sing-box arrêté');
      const ok = await new Promise<boolean>((res) => {
        const c = net.connect({ host: '127.0.0.1', port }, () => {
          c.destroy();
          res(true);
        });
        c.on('error', () => res(false));
      });
      if (ok) break;
      if (Date.now() > deadline) throw new Error('sing-box : port non ouvert');
      await new Promise((r) => setTimeout(r, 300));
    }
    t.port = port;
  }

  // ───────────────────────────── Arrêt ─────────────────────────────

  private async stop(id: string, keep = false) {
    const t = this.tunnels.get(id);
    if (!t) return;
    const proc = t.proc;
    t.proc = undefined;
    t.state = 'down';
    if (t.socks) {
      try {
        t.socks.close();
      } catch {
        /* déjà fermé */
      }
      t.socks = undefined;
    }
    t.port = undefined;
    if (proc && proc.exitCode === null) {
      proc.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 400));
      if (proc.exitCode === null) proc.kill('SIGKILL');
    }
    if (t.kind === 'openvpn' && t.tunIp) {
      await helper(['rule-del', t.tunIp, String(200 + t.slot), String(1000 + t.slot)]);
      await helper(['flush', String(200 + t.slot)]);
      t.tunIp = undefined;
    }
    for (const ext of ['ovpn', 'json']) fs.rm(path.join(this.dir, `${id}.${ext}`), { force: true }, () => undefined);
    if (!keep) this.tunnels.delete(id);
  }
}
