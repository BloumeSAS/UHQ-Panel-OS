import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createServer, Server as NetServer, Socket } from 'net';
import { URL } from 'url';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { TrafficService } from '../traffic/traffic.service';
import { SettingsService } from '../../config/settings.service';
import { parseProxyList, buildProxyUrl } from '../../common/utils/proxy-parse';
import { randomString, isDomainBlocked } from '../../common/utils/proxy-format';
import { allowedPortRange } from '../../common/utils/port-validation';
import { NotificationService } from '../notifications/notification.service';
import { RateLimiterService } from '../../common/rate-limiter.service';
import { VpnDetectionService } from './vpn-detection.service';
import {
  performHandshake,
  tcpConnect,
  readUntil,
  bidirectionalPipe,
} from './handshake';
import {
  NUM_RACERS,
  RACE_TIMEOUT_DEFAULT_MS,
  SessionRecord,
  TIMEOUT_DEFAULT_MS,
  UpstreamProxy,
} from './types';
import type { BackendProxy } from '@prisma/client';

/**
 * Port of `app/proxy_engine/server.py::ProxyServer`.
 *
 * Listens on PROXY_HOST:PROXY_PORT (default 0.0.0.0:8080) and accepts
 * HTTP / HTTPS-CONNECT client traffic, authenticates against the in-memory
 * user cache, then "races" N upstream proxies in parallel — first successful
 * tunnel wins, others are cancelled (except the residential fallback
 * fallback which is left running in the background per Phase 9 of the Python
 * engine).
 *
 * Preserved behaviours from the Python original:
 *  - sticky sessions parsed from `user[:session][:country]` in Basic-Auth
 *  - thread limiting per user with 429 enforcement
 *  - HTTP / SOCKS4 / SOCKS4a / SOCKS5 handshakes
 *  - permanent blacklist on upstream codes 400 / 407
 *  - in-memory proxy pool + user list, refreshed every 30s / 60s
 *  - country-suffix injection in the residential fallback URL
 *  - traffic accounting + 403 / Captcha / geo-block target detection
 *  - dead-proxy DB cleanup every 12h, session sweeper every 60s
 */
@Injectable()
export class ProxyServerService implements OnModuleDestroy {
  private readonly logger = new Logger(ProxyServerService.name);

  // Config ---------------------------------------------------------------
  private readonly host = process.env.PROXY_HOST ?? '0.0.0.0';
  private readonly port = Number(process.env.PROXY_PORT ?? 990);
  // Timeouts lus dynamiquement depuis la config DB (fallback env).
  private get timeoutMs(): number {
    return this.settings.getNumber('proxyTimeout') * 1000 || TIMEOUT_DEFAULT_MS;
  }
  private get racingTimeoutMs(): number {
    return this.settings.getNumber('proxyRacingTimeout') * 1000 || RACE_TIMEOUT_DEFAULT_MS;
  }
  // Ferme un tunnel sans aucune donnée échangée depuis ce délai — récupère les
  // connexions "mortes" (client disparu sans FIN/RST, ex. PC éteint) qui,
  // sans ça, restaient comptées comme actives indéfiniment.
  private get idleTimeoutMs(): number {
    return this.settings.getNumber('connectionIdleTimeout') * 1000 || 600_000;
  }
  // Proxy résidentiel de secours (fallback) : config DB (fallback env).
  private get fallbackProxyUrl(): string | null {
    return this.settings.get('scraperProxy') || null;
  }

  // State / caches -------------------------------------------------------
  /** Un net.Server par port d'écoute actif (port par défaut + ports dédiés pool/user). */
  private readonly servers = new Map<number, NetServer>();
  private syncing = false;
  /** port → nom de pool : ce port force CETTE pool, prioritaire sur `user.pool`. */
  private readonly portPoolMap = new Map<number, string>();
  /** nom de pool → port : pool assignée à un compte, dédiée à CE port (407 sur tout autre port). */
  private readonly poolPortMap = new Map<string, number>();
  /** Pools "Toujours en ligne" : un échec réel de connexion ne doit jamais les marquer KO (le checker les force déjà à isWorking=true, cf. checker.service.ts). */
  private readonly alwaysOnlinePoolSet = new Set<string>();
  /** Pools "Anti-VPN" : toute IP cliente identifiée VPN/hébergeur (cf. VpnDetectionService) est rejetée + bannie sur ces pools. */
  private readonly antiVpnPoolSet = new Set<string>();
  /**
   * nom de pool → gabarit de username pour le fallback résidentiel
   * (ex. "{user}-country-{country}"). Absent = format par défaut du moteur
   * ("{user}__country__{country}"), cf. `getFallbackUpstream`.
   */
  private readonly poolFallbackFormatMap = new Map<string, string>();
  /** port → username : ce port est exclusif à CE compte (407 pour tout autre). */
  private readonly portUserMap = new Map<number, string>();
  /** Plage publiée par Docker (PROXY_PORT_RANGE="min-max", défaut 9000-9250) — avertissement non-bloquant ici (le blocage dur est fait à l'écriture, cf. `assertPortAvailable`). */
  private readonly portRange = allowedPortRange();
  /** Active threads per username — atomic-ish under JS single-thread model */
  private readonly activeThreads = new Map<string, number>();
  /** Sticky sessions: key = "user:sessionId" */
  private readonly sessions = new Map<string, SessionRecord>();
  /**
   * Identifiants temporaires "session statique" — générés via
   * `GET /me/proxies/:id/static-session`. Chaque entrée pointe vers le VRAI
   * compte (`parentUsername`) mais épingle son propre upstream (comme une
   * session sticky) sans exposer ni le username réel ni un champ "session"
   * séparé au client : la ligne fournie est un simple `host:port:user:pass`.
   */
  private readonly tempCredentials = new Map<
    string,
    { parentUsername: string; password: string; expiresAt: number }
  >();
  /** Memory-only auth: every UserProxy keyed by username */
  private userListCache = new Map<string, any>();
  /**
   * IP bannies (indépendant des comptes) — vérifié avant même l'authentification
   * pour couper court à toute tentative depuis cette IP. Rechargé au boot, toutes
   * les 60s, et immédiatement après chaque écriture via `invalidateBanCache()`.
   */
  private bannedIpSet = new Set<string>();
  /** Cache des listes privées d'upstreams parsées, clé = texte brut `customProxies`. */
  private readonly customUpstreamCache = new Map<string, UpstreamProxy[]>();
  /** Top-N best-performing working proxies (refreshed every 30s) */
  private proxyPoolCache: UpstreamProxy[] = [];
  private proxyMapCache = new Map<string, UpstreamProxy>();
  /**
   * Dernière sélection d'un upstream (par id) — sert à pénaliser temporairement
   * un proxy qui vient d'être choisi pour éviter qu'un même "meilleur" proxy
   * ne soit réutilisé en boucle H24 même s'il reste en tête du classement.
   */
  private readonly lastPickedAt = new Map<string, number>();
  /** Fenêtre de refroidissement après sélection (ms) avant qu'un proxy ne redevienne pleinement éligible. */
  private static readonly PICK_COOLDOWN_MS = 60_000;
  private static readonly GiB = 1024 ** 3;
  /** Toutes les connexions clientes ouvertes (coupées proprement à l'arrêt). */
  private readonly clientSockets = new Set<Socket>();
  /**
   * Tunnels établis par compte (clé = vrai username du compte, y compris pour
   * les identifiants temporaires/sessions) — permet de couper en direct un
   * compte qui dépasse son quota, est bloqué, expire ou est supprimé.
   */
  private readonly accountSockets = new Map<string, Set<Socket>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly traffic: TrafficService,
    private readonly settings: SettingsService,
    private readonly notificationService: NotificationService,
    private readonly rateLimiter: RateLimiterService,
    private readonly vpnDetection: VpnDetectionService,
  ) {
    // Après chaque écriture du trafic en base, le cache mémoire reçoit le
    // `usedGb` réel — sinon il restait figé jusqu'au refresh 60s et le quota
    // était évalué sur une valeur périmée.
    this.traffic.setUsageListener((username, usedGb) => {
      const u = this.userListCache.get(username);
      if (u) u.usedGb = usedGb;
    });
  }

  // ===== Lifecycle =====================================================

  /**
   * Boot the TCP server. Pre-warms caches *before* accepting connections
   * so the very first client doesn't suffer a cold DB round trip.
   * Mirrors `ProxyServer.start()` in the Python version.
   */
  async start(): Promise<void> {
    await this.prewarmCaches();
    await this.syncListeners();
    this.startBackgroundTasks();
  }

  private async prewarmCaches(): Promise<void> {
    try {
      await this.prisma.ensureConnection();
      const users = await this.prisma.userProxy.findMany();
      this.userListCache = new Map(users.map((u) => [u.username, u]));
      const proxies = await this.loadProxyPoolCache();
      if (proxies.length > 0) {
        this.proxyPoolCache = proxies;
        this.proxyMapCache = new Map(this.proxyPoolCache.map((p) => [p.id, p]));
      }
      await this.reloadBannedIps();
      this.logger.log('Caches pre-warmed (users & proxies).');
    } catch (e) {
      this.logger.error(`Failed to pre-warm caches: ${e}`);
    }
  }

  /**
   * Charge le cache mémoire du pool **par pool** (une requête par pool
   * distincte + le "bucket" partagé `pool: null`), plutôt qu'un seul top-N
   * global toutes pools confondues trié par `successCount`.
   *
   * Bug corrigé (v2.4.4) : avec un seul top-N global, une pool dédiée qui
   * contient déjà des proxies scrapés à bon historique remplissait sa
   * tranche du cache — `getUpstreamProxy` prenait alors TOUJOURS la branche
   * cache (jamais vide) et ne retombait donc jamais sur le fallback DB
   * scopé par pool. Un proxy fraîchement ajouté manuellement dans cette même
   * pool (successCount=0, jamais entré dans le top global) restait alors
   * invisible indéfiniment, même après des milliers de requêtes. Chaque pool
   * a maintenant sa propre tranche garantie dans le cache, indépendamment de
   * la taille des autres pools.
   */
  private async loadProxyPoolCache(): Promise<UpstreamProxy[]> {
    const distinctPools = await this.prisma.backendProxy.findMany({
      where: { isWorking: true },
      distinct: ['pool'],
      select: { pool: true },
    });
    const poolNames = distinctPools.map((p) => p.pool);
    if (poolNames.length === 0) return [];
    const chunks = await Promise.all(
      poolNames.map((poolName) =>
        this.prisma.backendProxy.findMany({
          where: { isWorking: true, pool: poolName },
          // PAS de `take`/tri par successCount ici : une pool déjà bien
          // fournie en proxies performants (successCount élevé) tronquerait
          // sinon systématiquement les entrées neuves (successCount=0, ex.
          // ajout manuel) hors du cache — elles n'auraient alors JAMAIS
          // l'occasion d'accumuler du succès, quel que soit le nombre de
          // requêtes traitées depuis. Le cache doit contenir TOUT le stock
          // actif de la pool ; c'est le trust score + tirage pondéré
          // (`weightedPick`) qui arbitre la qualité au moment du choix, pas
          // un ORDER BY + LIMIT qui exclurait déjà les nouveaux venus en amont.
          select: {
            id: true,
            url: true,
            protocol: true,
            ip: true,
            port: true,
            country: true,
            pool: true,
            countryFormat: true,
            successCount: true,
            failureCount: true,
            averageLatency: true,
          },
        }),
      ),
    );
    return chunks.flat().map((p) => this.mapDbProxy(p)).filter(Boolean) as UpstreamProxy[];
  }

  /**
   * Recalcule les ports désirés (port par défaut + ports dédiés pool/user en
   * DB), ouvre les listeners manquants et ferme proprement (sans tuer les
   * connexions en cours, même comportement que `onModuleDestroy`) ceux qui ne
   * sont plus désirés. Appelé au boot, juste après chaque écriture pool/user
   * affectant `port` (via `invalidatePortCache`), et en filet de sécurité
   * toutes les 30s (cf. `startBackgroundTasks`).
   */
  async syncListeners(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const [pools, users, alwaysOnlinePools, fallbackFormatPools, antiVpnPools] = await Promise.all([
        this.prisma.proxyPool.findMany({ where: { port: { not: null } } }),
        this.prisma.userProxy.findMany({ where: { port: { not: null } } }),
        this.prisma.proxyPool.findMany({ where: { alwaysOnline: true }, select: { name: true } }),
        // Toutes les pools (pas seulement celles avec un port dédié) qui ont
        // un format de username fallback custom — la grande majorité des
        // pools partagent le port par défaut et seraient exclues du fetch ci-dessus.
        this.prisma.proxyPool.findMany({
          where: { fallbackCountryFormat: { not: null } },
          select: { name: true, fallbackCountryFormat: true },
        }),
        this.prisma.proxyPool.findMany({ where: { antiVpnEnabled: true }, select: { name: true } }),
      ]);
      this.portPoolMap.clear();
      this.poolPortMap.clear();
      for (const p of pools) if (p.port) {
        this.portPoolMap.set(p.port, p.name);
        this.poolPortMap.set(p.name, p.port);
      }
      this.portUserMap.clear();
      for (const u of users) if (u.port) this.portUserMap.set(u.port, u.username);
      this.alwaysOnlinePoolSet.clear();
      for (const p of alwaysOnlinePools) this.alwaysOnlinePoolSet.add(p.name);
      this.poolFallbackFormatMap.clear();
      for (const p of fallbackFormatPools) if (p.fallbackCountryFormat) this.poolFallbackFormatMap.set(p.name, p.fallbackCountryFormat);
      this.antiVpnPoolSet.clear();
      for (const p of antiVpnPools) this.antiVpnPoolSet.add(p.name);

      const desired = new Set<number>([
        this.port,
        ...this.portPoolMap.keys(),
        ...this.portUserMap.keys(),
      ]);

      for (const port of desired) {
        if (this.servers.has(port)) continue;
        if (port !== this.port && (port < this.portRange.min || port > this.portRange.max)) {
          this.logger.warn(
            `Port ${port} hors de PROXY_PORT_RANGE (${this.portRange.min}-${this.portRange.max}) — ` +
              `ne sera pas joignable depuis l'extérieur sans le republier dans docker-compose.yml.`,
          );
        }
        try {
          await this.listenOn(port);
        } catch (e) {
          this.logger.error(`Échec de bind sur le port ${port}: ${e}`);
        }
      }

      for (const [port, server] of this.servers) {
        if (desired.has(port)) continue;
        server.close();
        this.servers.delete(port);
        this.logger.log(`Listener fermé sur le port ${port} (plus assigné à une pool/un compte).`);
      }
    } finally {
      this.syncing = false;
    }
  }

  /** Déclenchement immédiat depuis les services panel après écriture pool/user. */
  public invalidatePortCache(): void {
    void this.syncListeners();
  }

  private listenOn(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer({ allowHalfOpen: false });
      // High backlog mirrors backlog=2048 from the Python `start_server` call.
      server.maxConnections = 1_000_000;
      server.on('connection', (s) => this.handleClient(s, port));
      server.once('error', (e) => {
        this.logger.error(`Listener error on port ${port}: ${e}`);
        reject(e);
      });
      server.listen({ host: this.host, port, backlog: 2048 }, () => {
        this.logger.log(`Proxy Server listening on ${this.host}:${port}`);
        this.servers.set(port, server);
        resolve();
      });
    });
  }

  private startBackgroundTasks(): void {
    // _session_cleaner — expired sticky sessions every 60s
    setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.sessions) {
        if (now > v.expiresAt) this.sessions.delete(k);
      }
      for (const [k, v] of this.tempCredentials) {
        if (now > v.expiresAt) this.tempCredentials.delete(k);
      }
    }, 60_000);

    // _background_pool_refresher — cache par pool, toutes les 30s
    setInterval(async () => {
      try {
        await this.prisma.ensureConnection();
        const proxies = await this.loadProxyPoolCache();
        if (proxies.length > 0) {
          this.proxyPoolCache = proxies;
          this.proxyMapCache = new Map(this.proxyPoolCache.map((p) => [p.id, p]));
        }
      } catch (e) {
        this.logger.error(`Failed to refresh proxy pool cache: ${e}`);
      }
      // Filet de sécurité : capte les ports assignés/retirés en DB sans passer
      // par invalidatePortCache (écriture directe, autre instance, etc.)
      try {
        await this.syncListeners();
      } catch (e) {
        this.logger.error(`Failed to sync port listeners: ${e}`);
      }
    }, 30_000);

    // _background_user_refresher — full user list every 60s
    setInterval(async () => {
      try {
        await this.prisma.ensureConnection();
        const users = await this.prisma.userProxy.findMany();
        this.userListCache = new Map(users.map((u) => [u.username, u]));
        // Filet de sécurité : coupe les tunnels ouverts d'un compte devenu
        // inéligible sans passer par invalidateUserCache (expiration atteinte,
        // suppression/blocage par écriture directe en base, etc.).
        for (const username of this.accountSockets.keys()) {
          const u = this.userListCache.get(username);
          const reason = u ? this.ineligibleReason(u) : 'account deleted';
          if (reason) this.disconnectAccount(username, reason);
        }
      } catch (e) {
        this.logger.error(`Failed to refresh user cache: ${e}`);
      }
      try {
        await this.reloadBannedIps();
      } catch (e) {
        this.logger.error(`Failed to refresh banned IP cache: ${e}`);
      }
    }, 60_000);
  }

  /**
   * Appelé après toute écriture sur un compte (panel, API). Recharge l'entrée
   * immédiatement et coupe ses tunnels ouverts s'il n'a plus le droit de
   * consommer (bloqué, expiré, supprimé, quota atteint) — avant, un tunnel
   * déjà établi continuait à consommer indéfiniment après un blocage.
   */
  public invalidateUserCache(username: string): void {
    this.userListCache.delete(username);
    void this.prisma.userProxy
      .findUnique({ where: { username } })
      .then((row) => {
        if (row) this.userListCache.set(username, row);
        const reason = row ? this.ineligibleReason(row) : 'account deleted';
        if (reason) this.disconnectAccount(username, reason);
      })
      .catch((e) => this.logger.debug(`Reload of ${username} failed: ${e}`));
  }

  /** Octets consommés par le compte : écrits en base (`usedGb`) + pas encore flushés. */
  private consumedBytes(user: any): number {
    return (user.usedGb ?? 0) * ProxyServerService.GiB + this.traffic.getPendingBytes(user.username);
  }

  private isOverQuota(user: any): boolean {
    return user.totalGb > 0 && this.consumedBytes(user) >= user.totalGb * ProxyServerService.GiB;
  }

  /** Raison pour laquelle un compte ne doit plus faire passer de trafic (null = OK). Hors whitelist IP. */
  private ineligibleReason(user: any): string | null {
    if (user.isBlocked) return 'blocked';
    if (user.expiresAt && new Date(user.expiresAt).getTime() < Date.now()) return 'expired';
    if (this.isOverQuota(user)) return 'data quota reached';
    return null;
  }

  /** Coupe tous les tunnels établis d'un compte. */
  private disconnectAccount(username: string, reason: string): void {
    const sockets = this.accountSockets.get(username);
    if (!sockets) return;
    let cut = 0;
    for (const s of sockets) {
      if (s.destroyed) continue;
      s.destroy();
      cut += 1;
    }
    if (cut > 0) this.logger.warn(`Cut ${cut} open tunnel(s) of ${username}: ${reason}`);
  }

  /** Recharge la liste des IP bannies en mémoire (bans non expirés uniquement). */
  private async reloadBannedIps(): Promise<void> {
    const rows = await this.prisma.bannedIp.findMany({
      where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { ip: true },
    });
    this.bannedIpSet = new Set(rows.map((r) => r.ip));
  }

  /** Déclenchement immédiat depuis le panel après un ban/débannissement. */
  public invalidateBanCache(): void {
    void this.reloadBannedIps().catch((e) => this.logger.error(`Failed to reload banned IPs: ${e}`));
  }

  private isIpBanned(ip: string): boolean {
    return !!ip && this.bannedIpSet.has(ip);
  }

  /**
   * Compte les échecs d'authentification proxy par IP (fenêtre glissante,
   * même mécanisme que le frein sur /auth/login) et bannit automatiquement
   * au-delà du seuil configuré — port 990 n'avait sinon aucune protection
   * anti-brute-force, contrairement au login panel. Ban temporaire (durée
   * configurable), via la même table que le bannissement manuel : visible
   * et révocable depuis IP bannies.
   */
  private async registerAuthFailure(ip: string): Promise<void> {
    if (!ip || !this.settings.getBool('proxyAuthAutoBanEnabled')) return;
    const threshold = this.settings.getPositiveNumber('proxyAuthFailBanThreshold') || 15;
    const windowSec = this.settings.getPositiveNumber('proxyAuthFailBanWindowSec') || 60;
    const allowed = this.rateLimiter.check(`proxyauth-fail:${ip}`, threshold, windowSec * 1000);
    if (allowed) return; // sous le seuil — rien à faire

    // Déjà bannie (ex. un burst a déjà déclenché le ban il y a quelques
    // secondes) : ne pas re-notifier/re-écrire à chaque nouvel échec.
    if (this.bannedIpSet.has(ip)) return;

    try {
      const durationHours = this.settings.getPositiveNumber('proxyAuthAutoBanDurationHours') || 24;
      const expiresAt = new Date(Date.now() + durationHours * 3600_000);
      await this.prisma.bannedIp.upsert({
        where: { ip },
        create: { ip, reason: `Auto-ban : ${threshold}+ échecs d'auth proxy en ${windowSec}s`, expiresAt, createdBy: 'auto' },
        update: { reason: `Auto-ban : ${threshold}+ échecs d'auth proxy en ${windowSec}s`, expiresAt, createdBy: 'auto' },
      });
      this.invalidateBanCache();
      this.logger.warn(`Auto-ban : ${ip} (${threshold}+ échecs d'auth en ${windowSec}s), ${durationHours}h`);
      void this.notificationService.notifyProxyAuthAutoBan(ip, threshold, windowSec, durationHours);
    } catch (e) {
      this.logger.error(`Échec de l'auto-ban pour ${ip}: ${e}`);
    }
  }

  /**
   * Ban immédiat (pas de compteur/fenêtre — une seule détection VPN positive
   * suffit) déclenché par l'option "Anti-VPN" d'une pool. Même table que les
   * autres auto-bans (BannedIp, visible/révocable depuis IP bannies) — durée
   * configurable (`vpnBanDurationHours`, Paramètres → Sécurité, défaut 24h) :
   * la détection (proxycheck.io + heuristique ASN, cf. VpnDetectionService)
   * n'est pas infaillible, un ban permanent exposerait trop aux faux positifs.
   */
  private async banVpnIp(ip: string, poolName: string): Promise<void> {
    if (!ip || this.bannedIpSet.has(ip)) return;
    try {
      const durationHours = this.settings.getPositiveNumber('vpnBanDurationHours') || 24;
      const expiresAt = new Date(Date.now() + durationHours * 3600_000);
      const reason = `Auto-ban : VPN détecté (anti-VPN activé sur la pool "${poolName}")`;
      await this.prisma.bannedIp.upsert({
        where: { ip },
        create: { ip, reason, expiresAt, createdBy: 'auto' },
        update: { reason, expiresAt, createdBy: 'auto' },
      });
      this.invalidateBanCache();
      void this.notificationService.notifyVpnAutoBan(ip, poolName, durationHours);
    } catch (e) {
      this.logger.error(`Échec de l'auto-ban VPN pour ${ip}: ${e}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    const closing = Promise.all(
      Array.from(this.servers.values()).map((s) => new Promise<void>((r) => s.close(() => r()))),
    );
    // `server.close()` n'aboutit qu'une fois TOUTES les connexions terminées :
    // avec des tunnels longue durée, l'arrêt restait bloqué jusqu'au SIGKILL
    // de Docker — et le flush final du trafic (TrafficService,
    // beforeApplicationShutdown) n'avait jamais lieu. On coupe donc les
    // connexions clientes : leurs octets déjà livrés sont dans le buffer.
    for (const s of this.clientSockets) s.destroy();
    await Promise.race([closing, new Promise((r) => setTimeout(r, 3000))]);
    this.servers.clear();
  }

  // ===== Inspection helpers (used by /api/v1/common) ===================

  getActiveThreads(): Map<string, number> {
    return this.activeThreads;
  }

  getSessions(): Map<string, SessionRecord> {
    return this.sessions;
  }

  /** Returns { proxyId: sessionCount } — used by /api/v1/common/proxies */
  getSessionUsageMap(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const v of this.sessions.values()) {
      out[v.proxyId] = (out[v.proxyId] ?? 0) + 1;
    }
    return out;
  }

  /** Tunnels actuellement ouverts, clé = id du BackendProxy upstream. */
  private readonly activeUpstreamConnections = new Map<
    string,
    { url: string; ip: string; port: number; protocol: string; pool: string | null; count: number; users: Set<string> }
  >();

  /** Snapshot pour le dashboard : proxies backend actuellement utilisés en direct. */
  getActiveUpstreamProxies(): Array<{ id: string; url: string; ip: string; port: number; protocol: string; pool: string | null; connections: number; users: string[] }> {
    return Array.from(this.activeUpstreamConnections.entries()).map(([id, v]) => ({
      id,
      url: v.url,
      ip: v.ip,
      port: v.port,
      protocol: v.protocol,
      pool: v.pool,
      connections: v.count,
      users: Array.from(v.users),
    }));
  }

  private trackUpstreamOpen(upstream: UpstreamProxy, username: string): void {
    let entry = this.activeUpstreamConnections.get(upstream.id);
    if (!entry) {
      entry = { url: upstream.url, ip: upstream.ip, port: upstream.port, protocol: upstream.protocol, pool: upstream.pool ?? null, count: 0, users: new Set() };
      this.activeUpstreamConnections.set(upstream.id, entry);
    }
    entry.count += 1;
    entry.users.add(username);
  }

  private trackUpstreamClose(upstreamId: string | null, username: string): void {
    if (!upstreamId) return;
    const entry = this.activeUpstreamConnections.get(upstreamId);
    if (!entry) return;
    entry.count = Math.max(0, entry.count - 1);
    if (entry.count === 0) {
      this.activeUpstreamConnections.delete(upstreamId);
    } else {
      entry.users.delete(username);
    }
  }

  // ===== Per-connection main loop =====================================

  private async handleClient(client: Socket, boundPort: number): Promise<void> {
    client.setNoDelay(true);
    // Filet de sécurité PERMANENT contre les erreurs socket (ECONNRESET,
    // etc.) — sans listener 'error' toujours présent, Node relance l'erreur
    // comme exception non interceptée dès qu'aucun listener ponctuel
    // (readUntil, handshake, bidirectionalPipe) n'est attaché à ce moment
    // précis. Voir le même correctif sur les sockets upstream (tcpConnect).
    client.on('error', () => {});

    // Ban IP : coupé avant même de lire la moindre donnée — `remoteAddress`
    // est déjà connu à l'établissement de la connexion TCP, pas besoin
    // d'attendre la requête pour rejeter. "Erreur HTTP" écrite en dur car le
    // protocole du client (HTTP proxy le plus souvent) n'est pas encore connu.
    const clientIp = client.remoteAddress?.replace(/^::ffff:/, '') ?? '';
    if (this.isIpBanned(clientIp)) {
      client.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\nIP banned.\r\n');
      client.end();
      return;
    }

    let user: any | null = null;
    // Username under which we actually incremented activeThreads. Stays null
    // when we never counted this connection (auth failure, 429 rejection),
    // so the finally block won't wrongly decrement a slot we never took.
    let threadKey: string | null = null;
    // Upstream id sur lequel un tunnel a réellement été ouvert (pour le
    // dashboard "proxies utilisés en direct") — libéré dans le `finally`.
    let openUpstreamId: string | null = null;
    // Compte (vrai username) sous lequel ce tunnel est enregistré dans
    // `accountSockets` — retiré dans le `finally`.
    let accountKey: string | null = null;

    // Ajouté juste avant le try : le `finally` garantit le retrait (un ajout
    // plus tôt fuirait sur les retours anticipés, ex. IP bannie).
    this.clientSockets.add(client);
    try {
      // Quick 3s timeout on the initial line read to flush hanging connections
      const firstLineRaw = await readUntil(client, Buffer.from('\r\n'), 3000).catch(
        () => null,
      );
      if (!firstLineRaw) return;
      // Octets bruts de la requête proxy du client (ligne + en-têtes + CRLF
      // final) — facturés au compte une fois le tunnel établi : c'est de la
      // bande passante réellement consommée par le client (avant, jamais comptée).
      let requestHeaderBytes = firstLineRaw.length;

      const firstLine = firstLineRaw.toString('latin1').trim();
      if (!firstLine) return;
      const parts = firstLine.split(' ');
      if (parts.length !== 3) return;
      const [method, path, protocol] = parts;

      // Read headers until empty CRLF
      const headers: string[] = [];
      let authHeader: string | null = null;
      while (true) {
        const lineRaw = await readUntil(client, Buffer.from('\r\n'), this.timeoutMs);
        requestHeaderBytes += lineRaw.length;
        if (lineRaw.equals(Buffer.from('\r\n'))) break;
        const line = lineRaw.toString('latin1').replace(/\r\n$/, '');
        headers.push(line);
        if (line.toLowerCase().startsWith('proxy-authorization:')) {
          authHeader = line.substring(line.indexOf(':') + 1).trim();
        }
      }

      user = await this.authenticate(clientIp, authHeader);
      if (!user) {
        this.logger.log(`Auth failed for ${clientIp}`);
        void this.registerAuthFailure(clientIp);
        client.write(
          'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Proxy"\r\n\r\n',
        );
        client.end();
        return;
      }
      this.logger.log(`Auth success for ${clientIp} (user=${user.username})`);

      // --- Domaines bloqués (par compte) ---
      // Vérifié tôt, avant de consommer un slot thread ou de tenter un
      // upstream. Pour CONNECT, `path` EST déjà le host:port cible (voir le
      // même correctif appliqué à `targetHost` plus bas) — pas besoin
      // d'attendre le contenu chiffré, le nom de domaine est connu dès la
      // ligne de requête.
      if (user.blockedDomains) {
        const checkHost = method === 'CONNECT' ? path : this.extractHost(path, headers);
        if (isDomainBlocked(checkHost, user.blockedDomains)) {
          this.logger.warn(`Domain blocked for ${user.username}: ${checkHost}`);
          client.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\nDomain blocked for this account.\r\n');
          client.end();
          return;
        }
      }

      // --- Sticky session + country override parsing ---
      let username = user.username;
      let sessionId: string | null = null;
      let requestedCountry: string | null = null;
      if (authHeader && authHeader.startsWith('Basic ')) {
        try {
          const decoded = Buffer.from(authHeader.substring(6), 'base64').toString('utf8');
          if (decoded.includes(':')) {
            const lastColon = decoded.lastIndexOf(':');
            const rawUserPart = decoded.substring(0, lastColon);
            const uParts = rawUserPart.split(':');
            username = uParts[0];
            if (uParts.length >= 2) sessionId = uParts[1];
            if (uParts.length >= 3 && uParts[2]) {
              requestedCountry = uParts[2].trim().toUpperCase();
            }
          }
        } catch {
          /* ignore */
        }
      }
      // Identifiant "session statique" temporaire : le username envoyé par le
      // client n'a pas de sous-champ session (juste user:pass classique) — on
      // épingle donc son upstream via un anchor dédié plutôt qu'un sessionId
      // parsé, tout en gardant `username` = tempUsername (isolation propre).
      if (!sessionId && user.__tempSessionAnchor) sessionId = user.__tempSessionAnchor;
      // Convention "user-session-XXXX" (4 champs) : le re-parsing colon
      // ci-dessus a pris le username BRUT (avec suffixe) faute de ':', on
      // retombe donc sur le vrai compte + la session extraite par `authenticate`.
      if (!sessionId && user.__usernameSessionId) {
        sessionId = user.__usernameSessionId;
        username = user.username;
      }

      // --- Port dédié exclusif : si CE port est réservé à un AUTRE compte, rejeter ---
      const dedicatedOwner = this.portUserMap.get(boundPort);
      if (dedicatedOwner && dedicatedOwner !== user.username) {
        this.logger.warn(`Port ${boundPort} is dedicated to another account, rejecting ${username}`);
        client.write(
          'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Proxy"\r\n\r\n',
        );
        client.end();
        return;
      }

      // --- Pool dédiée : si la pool du compte a son propre domaine/port, ce
      // compte ne doit être utilisable que via CE port (sinon la pool dédiée
      // devient accessible via le port par défaut / une autre pool). ---
      if (user.pool) {
        const requiredPoolPort = this.poolPortMap.get(user.pool);
        if (requiredPoolPort && requiredPoolPort !== boundPort) {
          this.logger.warn(
            `User ${username} belongs to pool "${user.pool}" dedicated to port ${requiredPoolPort}, rejecting on port ${boundPort}`,
          );
          client.write(
            'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Proxy"\r\n\r\n',
          );
          client.end();
          return;
        }
      }

      // Port dédié à une pool : prioritaire sur le pool par défaut du compte.
      const effectivePool = this.portPoolMap.get(boundPort) ?? user.pool ?? null;

      // --- Anti-VPN : si la pool effective a l'option activée, toute IP
      // cliente identifiée VPN/hébergeur est rejetée ET bannie immédiatement
      // (même table que l'auto-ban proxyAuth — voir `banVpnIp`). Vérifié
      // après l'auth (on connaît déjà le compte/la pool ciblée) mais avant
      // le comptage de threads, pour ne jamais compter un slot sur une
      // connexion qui sera de toute façon rejetée.
      if (effectivePool && this.antiVpnPoolSet.has(effectivePool)) {
        const vpn = await this.vpnDetection.isVpn(clientIp);
        if (vpn) {
          this.logger.warn(`VPN detected for ${clientIp} on pool "${effectivePool}" — rejecting + banning`);
          void this.banVpnIp(clientIp, effectivePool);
          client.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\nVPN detected.\r\n');
          client.end();
          return;
        }
      }

      const userTtlSec = user.stickySessionTtl ?? 1800;
      const sessionKey = sessionId ? `${username}:${sessionId}` : null;

      let stickyProxyId: string | null = null;
      if (sessionKey) {
        const sess = this.sessions.get(sessionKey);
        if (sess) {
          stickyProxyId = sess.proxyId;
          sess.expiresAt = Date.now() + userTtlSec * 1000;
        }
      }

      // --- Thread limiting ---
      // Compté sur le VRAI compte (`user.username`) : un identifiant
      // temporaire "session statique" (`parent_xxxxxx`) avait sinon son propre
      // compteur — limite de threads multipliée, et le dashboard "comptes
      // actifs" affichait ces noms temporaires sans leur bande passante.
      const acct = user.username;
      const limit = user.threadsLimit ?? 100;
      const currentThreads = this.activeThreads.get(acct) ?? 0;
      if (currentThreads >= limit) {
        this.logger.warn(`User ${acct} reached thread limit (${currentThreads}/${limit})`);
        client.write(
          'HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\nThread limit reached.\r\n',
        );
        client.end();
        return;
      }
      this.activeThreads.set(acct, currentThreads + 1);
      threadKey = acct; // counted — finally must release exactly this slot

      if (!requestedCountry) requestedCountry = user.countryFilter ?? null;

      // Liste privée d'upstreams du sous-utilisateur (si renseignée), sinon pool partagé.
      const customRaw =
        typeof user.customProxies === 'string' && user.customProxies.trim()
          ? (user.customProxies as string)
          : null;
      const customUpstreams = customRaw ? this.getCustomUpstreams(customRaw) : null;

      // --- Racing mechanism ---
      let stickyProxyObj: UpstreamProxy | null = null;
      if (stickyProxyId) {
        if (customUpstreams) {
          stickyProxyObj = customUpstreams.find((p) => p.id === stickyProxyId) ?? null;
        } else {
          stickyProxyObj = (this.proxyMapCache.get(stickyProxyId) as UpstreamProxy) ?? null;
          // Le cache mémoire ne garde que le top 2000 (successCount desc) toutes
          // pools confondues : un proxy d'une petite pool dédiée peut s'en faire
          // évincer sans que le cache soit "vide" pour autant. Ne pas se fier à
          // `proxyMapCache.size === 0` pour décider de retomber en base, sinon la
          // session sticky perd silencieusement son proxy dès qu'il sort du top 2000.
          if (!stickyProxyObj) {
            stickyProxyObj = this.mapDbProxy(
              await this.prisma.backendProxy
                .findUnique({ where: { id: stickyProxyId } })
                .catch(() => null),
            );
          }
        }
      }

      let winner: { upstream: UpstreamProxy; socket: Socket } | null = null;
      for (let attempt = 0; attempt < 2 && !winner; attempt++) {
        const proxiesToTry: UpstreamProxy[] = [];
        if (attempt === 0 && stickyProxyObj && stickyProxyObj.isWorking !== false) {
          proxiesToTry.push(this.applyCountrySelector(stickyProxyObj, requestedCountry));
        } else if (customUpstreams) {
          // Liste privée : on essaie les variantes DANS L'ORDRE (HTTP d'abord),
          // de façon SÉQUENTIELLE (cf. trySequential plus bas) — pas en race
          // concurrent. Raison : beaucoup de fournisseurs résidentiels limitent
          // les connexions simultanées par compte ; ouvrir HTTP+SOCKS5+SOCKS4 en
          // parallèle faisait rejeter la connexion HTTP légitime. curl n'ouvre
          // qu'une seule connexion → on imite ce comportement.
          proxiesToTry.push(...customUpstreams.slice(0, 12));
          this.logger.debug(
            `[custom] attempt #${attempt} — ${proxiesToTry.length} variante(s) en séquentiel: ` +
              proxiesToTry.map((p) => `${p.protocol}:${p.ip}:${p.port}`).join(', '),
          );
        } else {
          const excluded: string[] = [];
          for (let i = 0; i < NUM_RACERS; i++) {
            const p = await this.getUpstreamProxy(requestedCountry, excluded, effectivePool);
            if (p) {
              proxiesToTry.push(this.applyCountrySelector(p as UpstreamProxy, requestedCountry));
              excluded.push(p.id);
            }
          }
          // NOTE: the residential fallback is deliberately NOT added to the
          // primary race. As a stable commercial gateway it out-connects the
          // flaky free backend proxies almost every time, so including it here
          // meant ~100% of traffic burned paid residential bandwidth. We let
          // the backend pool race on its own; the residential proxy is used only as a
          // last resort by the "final fallback" block below, when no backend
          // proxy wins either attempt.
        }
        if (proxiesToTry.length === 0) continue;

        if (customUpstreams) {
          // Listes privées : essais séquentiels (HTTP d'abord), 1 connexion à la
          // fois — comme curl. Évite les limites de connexions concurrentes des
          // fournisseurs résidentiels et l'auto-détection de protocole reste OK.
          winner = await this.trySequential(proxiesToTry, method, path, headers);
          this.logger.debug(
            `[custom] attempt #${attempt} result: ${winner ? `WON by ${winner.upstream.protocol}:${winner.upstream.ip}:${winner.upstream.port}` : 'no winner'} (timeoutMs=${this.timeoutMs})`,
          );
        } else {
          winner = await this.race(proxiesToTry, method, path, headers, this.racingTimeoutMs);
        }
        if (winner && sessionKey) {
          this.sessions.set(sessionKey, {
            proxyId: winner.upstream.id,
            expiresAt: Date.now() + userTtlSec * 1000,
          });
        }
      }

      // --- Final fallback (Phase 10 in Python) ---
      if (!winner && this.fallbackProxyUrl) {
        try {
          const fb = this.getFallbackUpstream(requestedCountry, effectivePool);
          if (fb) {
            const sock = await tcpConnect(fb.ip, fb.port, this.timeoutMs);
            const skipHs = method !== 'CONNECT' && (fb.protocol ?? 'http').toLowerCase() === 'http';
            if (!skipHs) {
              // CONNECT: `path` EST déjà "host:port" (ligne de requête) — le
              // repasser dans extractHost() (qui attend une URL absolue ou un
              // header Host) le faisait échouer silencieusement et retomber
              // sur le fallback 'google.com:80', envoyant le tunnel vers le
              // mauvais hôte pour tout CONNECT sans header Host (courant).
              await performHandshake(
                sock,
                fb,
                method === 'CONNECT' ? path : this.extractHost(path, headers),
                this.timeoutMs,
              );
            }
            winner = { upstream: fb, socket: sock };
          }
        } catch (e) {
          this.logger.error(`Final fallback failed: ${e}`);
        }
      }

      if (!winner) {
        this.logger.error(`All upstream attempts failed for ${path}`);
        if (!client.destroyed) {
          client.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
          client.end();
        }
        return;
      }

      // --- Pipe data ---
      this.logger.log(`Race won by ${winner.upstream.url}`);
      // Même piège que le fallback ci-dessus : pour CONNECT, `path` est déjà
      // le host:port cible — extractHost() (qui suppose une URL absolue ou un
      // header Host) échouait silencieusement dessus et renvoyait le domaine
      // de secours 'google.com' en dur, polluant le tracking par domaine
      // (top domaines visités) pour tout CONNECT sans header Host.
      const targetHost = method === 'CONNECT' ? path : this.extractHost(path, headers);
      const hostKey = ProxyServerService.hostKey(targetHost);
      this.trackUpstreamOpen(winner.upstream, user.username);
      openUpstreamId = winner.upstream.id;

      // Enregistré AVANT tout comptage : si ce premier comptage fait franchir
      // le quota, ce tunnel doit déjà faire partie de ceux à couper.
      accountKey = user.username as string;
      let set = this.accountSockets.get(accountKey);
      if (!set) {
        set = new Set();
        this.accountSockets.set(accountKey, set);
      }
      set.add(client);

      if (method === 'CONNECT') {
        this.onChunk('sent', user.username, hostKey, requestHeaderBytes, true);
        const established = Buffer.from('HTTP/1.1 200 Connection established\r\n\r\n', 'latin1');
        client.write(established, (err) => {
          if (!err) this.onChunk('received', user.username, hostKey, established.length, false);
        });
        await bidirectionalPipe(
          client,
          winner.socket,
          (chunk) => this.onChunk('sent', user.username, hostKey, chunk.length, false),
          (chunk) => this.onChunk('received', user.username, hostKey, chunk.length, false),
          user?.bandwidthLimit ?? undefined,
          this.idleTimeoutMs,
        );
      } else {
        // Reconstruct & forward the buffered HTTP request, then pipe
        await this.relayHttpRequest(
          client,
          winner.socket,
          winner.upstream,
          method,
          path,
          protocol,
          headers,
          user.username,
          hostKey,
          requestHeaderBytes,
        );
      }
    } catch (e) {
      this.logger.debug(`Connection error: ${(e as Error)?.message ?? e}`);
      try {
        if (!client.destroyed) {
          client.write('HTTP/1.1 504 Gateway Timeout\r\n\r\n');
        }
      } catch {
        /* swallow */
      }
    } finally {
      // Release the thread slot ONLY if this connection actually took one.
      // (Auth failures and 429 rejections never increment, so threadKey stays
      // null and we must not decrement — doing so previously let users exceed
      // their thread limit, one leaked slot per rejected connection.)
      if (threadKey) {
        const cur = this.activeThreads.get(threadKey) ?? 0;
        const next = Math.max(0, cur - 1);
        if (next === 0) this.activeThreads.delete(threadKey);
        else this.activeThreads.set(threadKey, next);
      }
      if (openUpstreamId) this.trackUpstreamClose(openUpstreamId, user?.username ?? '');
      if (accountKey) {
        const set = this.accountSockets.get(accountKey);
        set?.delete(client);
        if (set && set.size === 0) this.accountSockets.delete(accountKey);
      }
      this.clientSockets.delete(client);
      try {
        if (!client.destroyed) client.destroy();
      } catch {
        /* */
      }
    }
  }

  /**
   * Race N upstream attempts in parallel. First successful handshake wins,
   * the others are cancelled — except a task tagged `fallback` (residential),
   * which is allowed to keep its socket alive in the background, mirroring
   * Phase 9 in `server.py`.
   *
   * Optimization (line 192 of server.py): for an HTTP request through an
   * HTTP upstream proxy we skip the CONNECT handshake and just do a TCP
   * open, since the absolute-URL request is sent directly to the proxy
   * after the race resolves.
   */
  /**
   * Essaie les upstreams UN PAR UN (pas de concurrence) et renvoie le premier
   * qui réussit son handshake. Utilisé pour les listes privées : imite un client
   * unique (curl) et évite de déclencher les limites de connexions simultanées
   * des fournisseurs résidentiels. L'ordre porte la priorité (HTTP en premier).
   */
  private async trySequential(
    upstreams: UpstreamProxy[],
    method: string,
    path: string,
    headers: string[],
  ): Promise<{ upstream: UpstreamProxy; socket: Socket } | null> {
    const target = method === 'CONNECT' ? path : this.extractHost(path, headers);
    const isHttpMethod = method !== 'CONNECT';
    for (const u of upstreams) {
      const skipHandshake = isHttpMethod && (u.protocol ?? 'http').toLowerCase() === 'http';
      const sock = await this.tryUpstream(u, target, skipHandshake);
      if (sock) return { upstream: u, socket: sock };
    }
    return null;
  }

  private async race(
    upstreams: UpstreamProxy[],
    method: string,
    path: string,
    headers: string[],
    raceTimeoutMs: number = this.racingTimeoutMs,
  ): Promise<{ upstream: UpstreamProxy; socket: Socket } | null> {
    const target =
      method === 'CONNECT' ? path : this.extractHost(path, headers);
    const isHttpMethod = method !== 'CONNECT';

    const tasks = upstreams.map((u) => {
      const skipHandshake = isHttpMethod && (u.protocol ?? 'http').toLowerCase() === 'http';
      return this.tryUpstream(u, target, skipHandshake);
    });
    let remaining = tasks.length;
    return await new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        // Cancel all non-fallback tasks; let "fallback" finish in background
        for (let i = 0; i < tasks.length; i++) {
          const u = upstreams[i];
          tasks[i].then(
            (res) => {
              if (res && u.id !== 'fallback') {
                try {
                  res.destroy();
                } catch {
                  /* */
                }
              }
            },
            () => {
              /* swallow */
            },
          );
        }
        resolve(null);
      }, raceTimeoutMs);

      tasks.forEach((p, idx) =>
        p.then(
          (sock) => {
            if (settled) {
              // Late winner: discard unless it's the fallback (kept alive)
              if (sock && upstreams[idx].id !== 'fallback') {
                try {
                  sock.destroy();
                } catch {
                  /* */
                }
              }
              return;
            }
            if (sock) {
              settled = true;
              clearTimeout(timer);
              // Cancel remaining (except fallback)
              tasks.forEach((other, j) => {
                if (j === idx) return;
                other.then(
                  (s) => {
                    if (s && upstreams[j].id !== 'fallback') {
                      try {
                        s.destroy();
                      } catch {
                        /* */
                      }
                    }
                  },
                  () => {
                    /* */
                  },
                );
              });
              resolve({ upstream: upstreams[idx], socket: sock });
            } else {
              remaining -= 1;
              if (remaining === 0 && !settled) {
                settled = true;
                clearTimeout(timer);
                resolve(null);
              }
            }
          },
          () => {
            remaining -= 1;
            if (remaining === 0 && !settled) {
              settled = true;
              clearTimeout(timer);
              resolve(null);
            }
          },
        ),
      );
    });
  }

  /**
   * Attempt a single upstream: TCP-connect + protocol handshake. On HTTP
   * code 400/407, permanently blacklist the proxy (in cache + DB). Returns
   * the ready socket on success, `null` on failure.
   *
   * When `skipHandshake` is true (HTTP method through HTTP upstream) we
   * return the socket immediately after the TCP connection succeeds, so
   * the caller can write the absolute-URL request directly.
   */
  private async tryUpstream(
    upstream: UpstreamProxy,
    targetHostPort: string,
    skipHandshake = false,
  ): Promise<Socket | null> {
    const isCustom = upstream.id.startsWith('custom:');
    let socket: Socket | null = null;
    try {
      if (isCustom) {
        this.logger.debug(
          `[custom] try ${upstream.protocol}://${upstream.ip}:${upstream.port} ` +
            `auth=${upstream.auth ? 'yes' : 'no'} skipHandshake=${skipHandshake} → ${targetHostPort}`,
        );
      }
      socket = await tcpConnect(upstream.ip, upstream.port, this.timeoutMs);
      if (!skipHandshake) {
        await performHandshake(socket, upstream, targetHostPort, this.timeoutMs);
      }
      if (isCustom) {
        this.logger.debug(`[custom] OK ${upstream.protocol}://${upstream.ip}:${upstream.port}`);
      }
      return socket;
    } catch (e) {
      if (socket) {
        try {
          socket.destroy();
        } catch {
          /* */
        }
      }
      // Échec d'un upstream privé : on logge la raison exacte (sinon silencieux,
      // car on ne touche ni la DB ni les notifications pour les listes custom).
      if (isCustom) {
        this.logger.debug(
          `[custom] FAIL ${upstream.protocol}://${upstream.ip}:${upstream.port}: ${String((e as Error)?.message ?? e)}`,
        );
      }
      // Les upstreams `fallback` et les listes privées (`custom:ip:port`) ne sont
      // pas des BackendProxy en base → ne jamais tenter d'update DB sur eux.
      // Pools "Toujours en ligne" : un échec de connexion réel (souvent transitoire)
      // ne doit jamais marquer isWorking=false ni blacklister — sinon on casse la
      // promesse "jamais KO" et on rétrécit le pool jusqu'au prochain cycle checker.
      // Le fallback résidentiel gère déjà cette requête individuelle plus bas.
      const isAlwaysOnline = !!upstream.pool && this.alwaysOnlinePoolSet.has(upstream.pool);
      if (upstream.id !== 'fallback' && !isCustom && !isAlwaysOnline) {
        const msg = String((e as Error)?.message ?? e).toUpperCase();
        const permanent = msg.includes('CODE 400') || msg.includes('CODE 407');
        try {
          if (permanent) {
            this.logger.warn(`🚫 Permanent blacklist: ${upstream.url}`);
            this.proxyMapCache.delete(upstream.id);
            this.proxyPoolCache = this.proxyPoolCache.filter((p) => p.id !== upstream.id);
            await this.prisma.backendProxy.update({
              where: { id: upstream.id },
              data: { isWorking: false, isBlacklisted: true },
            });
            void this.notificationService.notifyProxyDead(upstream.url, `Permanent Blacklist: ${msg}`);
          } else {
            await this.prisma.backendProxy.update({
              where: { id: upstream.id },
              data: { isWorking: false },
            });
            void this.notificationService.notifyProxyDead(upstream.url, `Tunnel request failed: ${msg}`);
          }
        } catch (dbErr) {
          this.logger.error(`DB update failed for ${upstream.url}: ${dbErr}`);
        }
      }
      return null;
    }
  }

  // ===== Auth ==========================================================

  private checkUserEligible(user: any, clientIp: string, username: string): boolean {
    if (user.isBlocked) {
      this.logger.warn(`Blocked user ${username} attempted connection.`);
      return false;
    }
    if (user.expiresAt && new Date(user.expiresAt) < new Date()) {
      this.logger.warn(`Expired sub-user ${username} attempted connection.`);
      return false;
    }
    // usedGb (patché après chaque flush) + octets pas encore écrits en base.
    if (this.isOverQuota(user)) {
      this.logger.warn(
        `User ${username} blocked: data limit (${(this.consumedBytes(user) / ProxyServerService.GiB).toFixed(3)}/${user.totalGb} GB)`,
      );
      return false;
    }
    if (user.ipWhitelist && user.ipWhitelist !== '*') {
      const whitelist = user.ipWhitelist.split(',').map((s: string) => s.trim());
      if (!whitelist.includes(clientIp)) return false;
    }
    return true;
  }

  private async authenticate(clientIp: string, authHeader: string | null): Promise<any | null> {
    if (!authHeader || !authHeader.startsWith('Basic ')) return null;
    try {
      const decoded = Buffer.from(authHeader.substring(6), 'base64').toString('utf8');
      const sepIdx = decoded.lastIndexOf(':');
      if (sepIdx === -1) return null;
      const rawUser = decoded.substring(0, sepIdx);
      const password = decoded.substring(sepIdx + 1);
      let username = rawUser.includes(':') ? rawUser.split(':')[0] : rawUser;

      // Formes supportées pour le "username" côté client :
      //   - "user"                    → compte simple
      //   - "user:session[:country]"  → format historique (colon), toujours accepté
      //   - "user-session-XXXX"       → convention standard 4-champs (host:port:user-session-id:pass),
      //     compatible avec n'importe quel logiciel qui n'accepte que 4 champs.
      //     Uniquement si pas de ':' — le format colon reste prioritaire (rétrocompat).
      let usernameSessionId: string | null = null;
      if (!rawUser.includes(':')) {
        const suffixIdx = username.lastIndexOf('-session-');
        if (suffixIdx !== -1) {
          usernameSessionId = username.slice(suffixIdx + '-session-'.length);
          username = username.slice(0, suffixIdx);
        }
      }

      // Identifiant "session statique" temporaire (host:port:user:pass sans
      // rien d'autre) : pointe vers le vrai compte mais épingle son propre
      // upstream, cf. `generateStaticSessionProxies`.
      const temp = this.tempCredentials.get(username);
      if (temp) {
        if (temp.expiresAt < Date.now() || !safeEqual(temp.password, password)) return null;
        let parent = this.userListCache.get(temp.parentUsername);
        if (!parent) {
          parent = await this.prisma.userProxy.findUnique({ where: { username: temp.parentUsername } });
          if (parent) this.userListCache.set(temp.parentUsername, parent);
        }
        if (!parent || !this.checkUserEligible(parent, clientIp, username)) return null;
        return { ...parent, __tempSessionAnchor: username };
      }

      let user = this.userListCache.get(username);
      if (!user) {
        user = await this.prisma.userProxy.findUnique({ where: { username } });
        if (user) this.userListCache.set(username, user);
      }
      if (!user || !safeEqual(user.password, password)) return null;
      if (!this.checkUserEligible(user, clientIp, username)) return null;
      return usernameSessionId ? { ...user, __usernameSessionId: usernameSessionId } : user;
    } catch {
      return null;
    }
  }

  /**
   * Génère `count` identifiants proxy temporaires ("session statique") liés
   * au compte `parentUsername`. Chaque credential épingle son propre upstream
   * (comme une session sticky) pendant `ttlSec`, et est exposé au client sous
   * forme d'un simple couple user/pass — jamais de champ "session" visible.
   */
  generateStaticSessionProxies(
    parentUsername: string,
    count: number,
    ttlSec: number,
  ): Array<{ username: string; password: string; expiresAt: number }> {
    const expiresAt = Date.now() + ttlSec * 1000;
    const out: Array<{ username: string; password: string; expiresAt: number }> = [];
    for (let i = 0; i < count; i++) {
      const tempUsername = `${parentUsername}_${randomString(6)}`;
      const tempPassword = randomString(12);
      this.tempCredentials.set(tempUsername, { parentUsername, password: tempPassword, expiresAt });
      out.push({ username: tempUsername, password: tempPassword, expiresAt });
    }
    return out;
  }

  // ===== Upstream selection ===========================================

  /** Memory-first proxy selection. Falls back to DB if cache is empty. */
  /**
   * Liste privée d'upstreams d'un utilisateur (parsée + cache). Chaque entrée a
   * un id déterministe `custom:ip:port` pour la stabilité des sessions sticky.
   */
  private getCustomUpstreams(raw: string): UpstreamProxy[] {
    const cached = this.customUpstreamCache.get(raw);
    if (cached) return cached;
    const list: UpstreamProxy[] = [];
    for (const p of parseProxyList(raw)) {
      // Sans schéma explicite, on ne sait pas si le proxy parle HTTP ou SOCKS.
      // On génère donc une variante par protocole : elles seront mises en
      // concurrence (race) et celle qui répond gagne → auto-détection, quel que
      // soit le fournisseur. Avec un schéma explicite, on respecte le choix.
      const protocols = p.schemeGiven ? [p.protocol] : ['http', 'socks5', 'socks4'];
      for (const protocol of protocols) {
        list.push({
          // id incluant le protocole pour éviter les collisions entre variantes
          // et garder les sessions sticky stables sur le protocole gagnant.
          id: `custom:${protocol}:${p.ip}:${p.port}`,
          url: `${protocol}://${p.ip}:${p.port}`,
          protocol,
          ip: p.ip,
          port: p.port,
          auth: p.auth,
          isWorking: true,
        });
      }
    }
    this.customUpstreamCache.set(raw, list);
    return list;
  }

  /**
   * Trust score d'un proxy : combine le taux de succès et la latence (plus
   * bas = mieux), puis applique une pénalité de "cooldown" si ce proxy vient
   * d'être choisi récemment — pour éviter qu'un même top-proxy monopolise le
   * trafic H24 juste parce qu'il reste en tête du classement.
   */
  private trustScore(p: { id: string; successCount?: number; failureCount?: number; averageLatency?: number | null }): number {
    const success = p.successCount ?? 0;
    const failure = p.failureCount ?? 0;
    const total = success + failure;
    const rate = (success + 10) / (total + 10);
    const lat = p.averageLatency ?? 2.0;
    let score = rate * (1 / (lat * lat));
    const lastPick = this.lastPickedAt.get(p.id);
    if (lastPick) {
      const age = Date.now() - lastPick;
      if (age < ProxyServerService.PICK_COOLDOWN_MS) {
        // Réduit fortement le poids juste après sélection, remonte linéairement
        // jusqu'au poids plein une fois le cooldown écoulé.
        const factor = 0.15 + 0.85 * (age / ProxyServerService.PICK_COOLDOWN_MS);
        score *= factor;
      }
    }
    return score;
  }

  /**
   * Applique un gabarit d'injection de pays dans un username : {user} → le
   * username d'origine, {country}/{COUNTRY} → le pays cible (en/minuscule
   * ou MAJUSCULE) — tiré AU HASARD parmi les codes séparés par virgule s'il
   * y en a plusieurs (ex. "IT,FR,US"). Avant, seul le premier code de la
   * liste était jamais utilisé, quel que soit le nombre de requêtes.
   * Utilisé par le fallback résidentiel (pool.fallbackCountryFormat) ET par
   * les proxies "pays sélectionnable" du pool (BackendProxy.countryFormat) —
   * même syntaxe de gabarit partout.
   */
  private static renderCountryFormat(format: string, originalUser: string, country: string): string {
    const codes = country.split(',').map((c) => c.trim()).filter(Boolean);
    const target = codes[Math.floor(Math.random() * codes.length)] ?? country.trim();
    return format
      .replace(/\{user\}/g, originalUser)
      .replace(/\{COUNTRY\}/g, target.toUpperCase())
      .replace(/\{country\}/g, target.toLowerCase());
  }

  /**
   * Réécrit à la volée le username d'un proxy "pays sélectionnable"
   * (`countryFormat` renseigné) pour matcher le pays demandé — no-op si le
   * proxy n'a pas de gabarit, si aucun pays n'est demandé, ou si le proxy
   * n'a pas d'identifiants embarqués. Le proxy retourné par `getUpstreamProxy`
   * / résolu depuis une session sticky garde son username "générique" tel
   * quel tant qu'on ne passe pas par ici.
   */
  private applyCountrySelector(upstream: UpstreamProxy, requestedCountry: string | null): UpstreamProxy {
    if (!upstream.countryFormat || !requestedCountry || !upstream.auth) return upstream;
    const sepIdx = upstream.auth.indexOf(':');
    if (sepIdx === -1) return upstream;
    const origUser = upstream.auth.slice(0, sepIdx);
    const pass = upstream.auth.slice(sepIdx + 1);
    const newUser = ProxyServerService.renderCountryFormat(upstream.countryFormat, origUser, requestedCountry);
    return { ...upstream, auth: `${newUser}:${pass}` };
  }

  /** Tirage pondéré (roulette wheel) parmi une liste selon leur trust score. */
  private weightedPick<T extends { id: string }>(items: T[]): T | null {
    if (items.length === 0) return null;
    if (items.length === 1) return items[0];
    const weights = items.map((p) => Math.max(this.trustScore(p as any), 0.0001));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  private markPicked(id: string) {
    this.lastPickedAt.set(id, Date.now());
    // Évite une fuite mémoire lente : purge occasionnelle des entrées expirées.
    if (this.lastPickedAt.size > 5000) {
      const cutoff = Date.now() - ProxyServerService.PICK_COOLDOWN_MS * 5;
      for (const [k, v] of this.lastPickedAt) if (v < cutoff) this.lastPickedAt.delete(k);
    }
  }

  private async getUpstreamProxy(
    country: string | null,
    excludeIds: string[],
    poolName?: string | null,
  ): Promise<UpstreamProxy | null> {
    if (this.proxyPoolCache.length > 0) {
      let pool = this.proxyPoolCache;
      if (poolName) pool = pool.filter((p) => p.pool === poolName);
      if (country) {
        const countries = country.split(',').map((c) => c.trim().toUpperCase());
        // Un proxy "pays sélectionnable" (countryFormat renseigné) matche
        // n'importe quel pays demandé — son username est réécrit à la volée
        // plus bas (cf. applyCountrySelector), son `country` stocké n'a pas
        // à correspondre (souvent null/générique pour ce genre de proxy).
        pool = pool.filter((p) => (p.country && countries.includes(p.country)) || !!p.countryFormat);
      }
      if (excludeIds.length > 0) pool = pool.filter((p) => !excludeIds.includes(p.id));
      if (pool.length > 0) {
        // Tirage pondéré par trust score sur TOUT le sous-ensemble filtré
        // (pool/pays/exclusions) — pas de fenêtre "top-N" arbitraire : depuis
        // que `loadProxyPoolCache` ne trie plus par successCount, un
        // sous-ensemble tronqué ne serait plus "les meilleurs" mais une
        // coupe arbitraire, qui recréerait le même problème d'exclusion
        // qu'on vient de corriger. `weightedPick` est un simple passage
        // linéaire — même sur plusieurs milliers de candidats, le coût reste
        // négligeable face au round-trip réseau qui suit.
        const picked = this.weightedPick(pool);
        if (picked) this.markPicked(picked.id);
        return picked;
      }
      // Rien dans le cache pour cette pool/pays (cache pas encore rafraîchi
      // depuis l'ajout de cette pool, filtre pays trop restrictif, etc.). Le
      // cache garde désormais une tranche PAR pool (voir `loadProxyPoolCache`),
      // mais on retombe quand même sur une requête DB ciblée (indexée sur
      // `pool`) par sécurité plutôt que de déclarer forfait — sinon ces
      // utilisateurs basculent en permanence sur le fallback résidentiel alors
      // que leurs proxies sont fonctionnels.
    }

    const where: any = { isWorking: true };
    if (poolName) where.pool = poolName;
    if (excludeIds.length > 0) where.id = { notIn: excludeIds };
    if (country) {
      const countryClause = country.includes(',')
        ? { in: country.split(',').map((c) => c.trim().toUpperCase()) }
        : country.toUpperCase();
      // Même règle que le cache mémoire ci-dessus : un proxy "pays
      // sélectionnable" matche n'importe quel filtre pays.
      where.OR = [{ country: countryClause }, { countryFormat: { not: null } }];
    }
    // Pas de tri par `successCount` ici non plus (même raison que dans
    // `loadProxyPoolCache` : ça exclurait à jamais les proxies neufs de ce
    // fallback DB, pourtant censé être le filet de sécurité qui les
    // retrouve). `take` reste borné pour ne pas ramener des millions de
    // lignes sur une requête live, mais sans biaiser QUI rentre dans ce lot.
    const proxies = await this.prisma.backendProxy.findMany({
      where,
      take: 2000,
    });
    if (proxies.length === 0) return null;

    const picked = this.weightedPick(proxies as any);
    if (!picked) return null;
    this.markPicked(picked.id);
    return this.mapDbProxy(picked);
  }

  /**
   * Build a synthetic UpstreamProxy from SCRAPER_PROXY env var.
   *
   * `poolName` sélectionne le gabarit de username à utiliser pour injecter
   * le pays demandé : celui configuré sur la pool (`fallbackCountryFormat`,
   * ex. "{user}-country-{country}") si présent, sinon le format historique
   * du moteur ("{user}__country__{country}") — certains fournisseurs
   * résidentiels attendent une convention précise, pas toujours "__country__".
   */
  private getFallbackUpstream(country: string | null, poolName?: string | null): UpstreamProxy | null {
    let urlStr = buildProxyUrl(this.fallbackProxyUrl);
    if (!urlStr) return null;
    try {
      const u = new URL(urlStr);
      // Residential fallback: inject country in username -> "user__country__xx:pass@host"
      // (ou le format custom de la pool, cf. doc ci-dessus).
      if (country && u.username) {
        const decodedUser = decodeURIComponent(u.username);
        const format = (poolName && this.poolFallbackFormatMap.get(poolName)) || '{user}__country__{country}';
        u.username = ProxyServerService.renderCountryFormat(format, decodedUser, country);
        urlStr = u.toString();
      }
      const parsed = new URL(urlStr);
      return {
        id: 'fallback',
        url: urlStr,
        protocol: parsed.protocol.replace(':', ''),
        ip: parsed.hostname,
        port: Number(parsed.port || 80),
        auth: parsed.username
          ? `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`
          : null,
      };
    } catch {
      return null;
    }
  }

  private mapDbProxy(p: any): UpstreamProxy | null {
    if (!p) return null;
    try {
      const u = new URL(p.url);
      if (u.username) {
        p.auth = `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`;
      } else {
        p.auth = null;
      }
    } catch {
      p.auth = null;
    }
    return p as UpstreamProxy;
  }

  // ===== Helpers ======================================================

  private extractHost(path: string, headers: string[]): string {
    let host = '';
    for (const h of headers) {
      if (h.toLowerCase().startsWith('host:')) {
        host = h.substring(h.indexOf(':') + 1).trim();
        break;
      }
    }
    if (!host) {
      try {
        const u = new URL(path);
        host = u.host;
      } catch {
        /* */
      }
    }
    // Repli neutre — un vrai nom de domaine ici (l'ancien 'google.com:80')
    // polluait silencieusement le tracking et le blocage par domaine dès
    // qu'un client HTTP omettait le header Host (rare mais déjà observé).
    if (!host) return 'unknown-host:80';
    if (!host.includes(':')) host = `${host}:80`;
    return host;
  }

  /**
   * Forward an HTTP (non-CONNECT) request to an already-tunneled upstream.
   * Reconstructs the absolute request line when needed, strips client-side
   * Proxy-Authorization, and injects upstream creds when present.
   */
  private async relayHttpRequest(
    client: Socket,
    upstreamSocket: Socket,
    upstream: UpstreamProxy,
    method: string,
    path: string,
    protocol: string,
    headers: string[],
    username: string,
    hostKey: string,
    requestHeaderBytes: number,
  ): Promise<void> {
    const proto = (upstream.protocol || 'http').toLowerCase();
    let finalPath = path;
    if (!path.startsWith('http') && proto === 'http') {
      let hostHeader = '';
      for (const h of headers) {
        if (h.toLowerCase().startsWith('host:')) {
          hostHeader = h.substring(h.indexOf(':') + 1).trim();
          break;
        }
      }
      finalPath = `http://${hostHeader}${path}`;
    }

    let req = `${method} ${finalPath} ${protocol}\r\n`;
    if (upstream.auth) {
      const b64 = Buffer.from(upstream.auth, 'utf8').toString('base64');
      req += `Proxy-Authorization: Basic ${b64}\r\n`;
    }
    for (const h of headers) {
      if (!h.toLowerCase().startsWith('proxy-authorization:')) req += `${h}\r\n`;
    }
    req += '\r\n';
    // La requête reconstruite est écrite ici directement (pas via le pipe) :
    // on facture les octets de la requête TELLE QUE LE CLIENT L'A ENVOYÉE
    // (`requestHeaderBytes`, même base que pour CONNECT) et on compte la
    // requête (isNewReq=true) une fois transmise.
    const reqBuf = Buffer.from(req, 'latin1');
    upstreamSocket.write(reqBuf, (err) => {
      if (!err) this.onChunk('sent', username, hostKey, requestHeaderBytes, true);
    });

    const user = this.userListCache.get(username);
    let firstResponseChunk = true;
    await bidirectionalPipe(
      client,
      upstreamSocket,
      // Corps de requête éventuel (POST/PUT…) client → upstream.
      (chunk) => this.onChunk('sent', username, hostKey, chunk.length, false),
      (chunk) => {
        this.onChunk('received', username, hostKey, chunk.length, false);
        // HTTP en clair : on peut sniffer le début de la réponse (blocage
        // cible) — code auparavant mort (jamais appelé avec isNewReq=true).
        if (firstResponseChunk) {
          firstResponseChunk = false;
          this.sniffTargetBlocking(username, hostKey, chunk);
        }
      },
      user?.bandwidthLimit ?? undefined,
      this.idleTimeoutMs,
    );
  }

  /**
   * Clé "domaine" normalisée pour le détail par hôte (ProxyUsage) : sans port,
   * en minuscules, sans point final ; gère les littéraux IPv6 `[::1]:443`
   * (avant : coupés au premier ':' → clé "[").
   */
  private static hostKey(target: string): string {
    let h = target.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split('/')[0];
    if (h.startsWith('[')) {
      const end = h.indexOf(']');
      h = end > 0 ? h.slice(1, end) : h.slice(1);
    } else if (h.indexOf(':') === h.lastIndexOf(':')) {
      h = h.split(':')[0]; // un seul ':' = séparateur de port (sinon IPv6 nu)
    }
    return h.toLowerCase().replace(/\.$/, '') || 'unknown-host';
  }

  /**
   * Comptabilise des octets RÉELLEMENT livrés (appelé depuis les callbacks
   * d'écriture de `bidirectionalPipe`) et applique le quota en temps réel :
   * dès que usedGb + octets pas encore flushés atteint `totalGb`, tous les
   * tunnels du compte sont coupés — avant, seul l'établissement d'une
   * connexion vérifiait le quota (sur un cache vieux de jusqu'à 60s), et un
   * tunnel ouvert pouvait consommer sans limite au-delà.
   */
  private onChunk(
    direction: 'sent' | 'received',
    username: string,
    hostKey: string,
    bytes: number,
    isNewReq: boolean,
  ): void {
    this.traffic.logTraffic(
      username,
      hostKey,
      direction === 'sent' ? bytes : 0,
      direction === 'received' ? bytes : 0,
      isNewReq,
    );
    const u = this.userListCache.get(username);
    if (u && this.isOverQuota(u)) this.disconnectAccount(username, 'data quota reached');
  }

  /** Détection légère de blocage côté cible sur le début d'une réponse HTTP en clair. */
  private sniffTargetBlocking(username: string, hostKey: string, data: Buffer): void {
    if (data.length <= 20) return;
    const snip = data.subarray(0, 1024).toString('latin1').toLowerCase();
    let reason: string | null = null;
    if (snip.includes('403 forbidden')) reason = '403 Forbidden';
    else if (snip.includes('captcha') || snip.includes('google.com/sorry'))
      reason = 'Captcha detected';
    else if (snip.includes('geo-blocked') || snip.includes('not available in your country'))
      reason = 'Geo-blocked';
    if (reason) {
      this.logger.warn(`Target blocking on ${hostKey}: ${reason}`);
      this.recordProxyUsageError(username, hostKey, reason);
    }
  }

  /**
   * Persiste une raison de blocage détectée (sniff HTTP en clair) — avant,
   * seul un `logger.warn()` transitoire existait, perdu dès que la ligne
   * sortait du ring buffer. Bucketing par jour, incrémenté (pas une ligne par
   * occurrence) pour rester léger sur du trafic à fort volume. Fire-and-forget :
   * ne doit jamais ralentir/faire échouer le relais de données en cours.
   */
  private recordProxyUsageError(username: string, hostname: string, reason: string): void {
    const userId = this.userListCache.get(username)?.id;
    if (!userId) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.prisma.proxyUsageError
      .upsert({
        where: { userProxyId_hostname_date_reason: { userProxyId: userId, hostname, date: today, reason } },
        create: { userProxyId: userId, hostname, date: today, reason, count: 1 },
        update: { count: { increment: 1 } },
      })
      .catch(() => undefined);
  }
}

/** Comparaison à temps constant — évite un timing attack sur le mot de passe proxy. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
