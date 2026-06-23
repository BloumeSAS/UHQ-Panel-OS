import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createServer, Server as NetServer, Socket } from 'net';
import { URL } from 'url';
import { PrismaService } from '../../database/prisma.service';
import { TrafficService } from '../traffic/traffic.service';
import { SettingsService } from '../../config/settings.service';
import { parseProxyList, buildProxyUrl } from '../../common/utils/proxy-parse';
import { allowedPortRange } from '../../common/utils/port-validation';
import { NotificationService } from '../notifications/notification.service';
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
  /** port → username : ce port est exclusif à CE compte (407 pour tout autre). */
  private readonly portUserMap = new Map<number, string>();
  /** Plage publiée par Docker (PROXY_PORT_RANGE="min-max", défaut 9000-9100) — avertissement non-bloquant ici (le blocage dur est fait à l'écriture, cf. `assertPortAvailable`). */
  private readonly portRange = allowedPortRange();
  /** Active threads per username — atomic-ish under JS single-thread model */
  private readonly activeThreads = new Map<string, number>();
  /** Sticky sessions: key = "user:sessionId" */
  private readonly sessions = new Map<string, SessionRecord>();
  /** Memory-only auth: every UserProxy keyed by username */
  private userListCache = new Map<string, any>();
  /** Cache des listes privées d'upstreams parsées, clé = texte brut `customProxies`. */
  private readonly customUpstreamCache = new Map<string, UpstreamProxy[]>();
  /** Top-N best-performing working proxies (refreshed every 30s) */
  private proxyPoolCache: UpstreamProxy[] = [];
  private proxyMapCache = new Map<string, UpstreamProxy>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly traffic: TrafficService,
    private readonly settings: SettingsService,
    private readonly notificationService: NotificationService,
  ) {}

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
      const proxies = await this.prisma.backendProxy.findMany({
        where: { isWorking: true },
        orderBy: [{ successCount: 'desc' }, { lastChecked: 'desc' }],
        take: 500,
      });
      if (proxies.length > 0) {
        this.proxyPoolCache = proxies.map((p) => this.mapDbProxy(p)).filter(Boolean) as UpstreamProxy[];
        this.proxyMapCache = new Map(this.proxyPoolCache.map((p) => [p.id, p]));
      }
      this.logger.log('Caches pre-warmed (users & proxies).');
    } catch (e) {
      this.logger.error(`Failed to pre-warm caches: ${e}`);
    }
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
      const [pools, users] = await Promise.all([
        this.prisma.proxyPool.findMany({ where: { port: { not: null } } }),
        this.prisma.userProxy.findMany({ where: { port: { not: null } } }),
      ]);
      this.portPoolMap.clear();
      for (const p of pools) if (p.port) this.portPoolMap.set(p.port, p.name);
      this.portUserMap.clear();
      for (const u of users) if (u.port) this.portUserMap.set(u.port, u.username);

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
    // _background_cleaner — dead-proxy DB purge every 12h
    setInterval(async () => {
      try {
        const r = await this.prisma.backendProxy.deleteMany({
          where: { isWorking: false, isBlacklisted: false },
        });
        this.logger.log(`Cleanup: deleted ${r.count} dead proxies.`);
      } catch (e) {
        this.logger.error(`Cleanup task failed: ${e}`);
      }
    }, 43_200_000);

    // _session_cleaner — expired sticky sessions every 60s
    setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.sessions) {
        if (now > v.expiresAt) this.sessions.delete(k);
      }
    }, 60_000);

    // _background_pool_refresher — top 2000 proxies every 30s
    setInterval(async () => {
      try {
        await this.prisma.ensureConnection();
        const proxies = await this.prisma.backendProxy.findMany({
          where: { isWorking: true },
          orderBy: [{ successCount: 'desc' }, { lastChecked: 'desc' }],
          take: 2000,
        });
        if (proxies.length > 0) {
          this.proxyPoolCache = proxies.map((p) => this.mapDbProxy(p)).filter(Boolean) as UpstreamProxy[];
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
      } catch (e) {
        this.logger.error(`Failed to refresh user cache: ${e}`);
      }
    }, 60_000);
  }

  public invalidateUserCache(username: string): void {
    this.userListCache.delete(username);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      Array.from(this.servers.values()).map((s) => new Promise<void>((r) => s.close(() => r()))),
    );
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

  // ===== Per-connection main loop =====================================

  private async handleClient(client: Socket, boundPort: number): Promise<void> {
    client.setNoDelay(true);
    let user: any | null = null;
    // Username under which we actually incremented activeThreads. Stays null
    // when we never counted this connection (auth failure, 429 rejection),
    // so the finally block won't wrongly decrement a slot we never took.
    let threadKey: string | null = null;

    try {
      // Quick 3s timeout on the initial line read to flush hanging connections
      const firstLineRaw = await readUntil(client, Buffer.from('\r\n'), 3000).catch(
        () => null,
      );
      if (!firstLineRaw) return;

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
        if (lineRaw.equals(Buffer.from('\r\n'))) break;
        const line = lineRaw.toString('latin1').replace(/\r\n$/, '');
        headers.push(line);
        if (line.toLowerCase().startsWith('proxy-authorization:')) {
          authHeader = line.substring(line.indexOf(':') + 1).trim();
        }
      }

      const clientIp = client.remoteAddress?.replace(/^::ffff:/, '') ?? '';
      user = await this.authenticate(clientIp, authHeader);
      if (!user) {
        this.logger.log(`Auth failed for ${clientIp}`);
        client.write(
          'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Proxy"\r\n\r\n',
        );
        client.end();
        return;
      }
      this.logger.log(`Auth success for ${clientIp} (user=${user.username})`);

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

      // --- Port dédié exclusif : si CE port est réservé à un AUTRE compte, rejeter ---
      const dedicatedOwner = this.portUserMap.get(boundPort);
      if (dedicatedOwner && dedicatedOwner !== username) {
        this.logger.warn(`Port ${boundPort} is dedicated to another account, rejecting ${username}`);
        client.write(
          'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Proxy"\r\n\r\n',
        );
        client.end();
        return;
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
      const limit = user.threadsLimit ?? 100;
      const currentThreads = this.activeThreads.get(username) ?? 0;
      if (currentThreads >= limit) {
        this.logger.warn(`User ${username} reached thread limit (${currentThreads}/${limit})`);
        client.write(
          'HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\nThread limit reached.\r\n',
        );
        client.end();
        return;
      }
      this.activeThreads.set(username, currentThreads + 1);
      threadKey = username; // counted — finally must release exactly this slot

      if (!requestedCountry) requestedCountry = user.countryFilter ?? null;

      // Port dédié à une pool : prioritaire sur le pool par défaut du compte.
      const effectivePool = this.portPoolMap.get(boundPort) ?? user.pool ?? null;

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
          proxiesToTry.push(stickyProxyObj);
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
              proxiesToTry.push(p as UpstreamProxy);
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
          const fb = this.getFallbackUpstream(requestedCountry);
          if (fb) {
            const sock = await tcpConnect(fb.ip, fb.port, this.timeoutMs);
            const skipHs = method !== 'CONNECT' && (fb.protocol ?? 'http').toLowerCase() === 'http';
            if (!skipHs) {
              await performHandshake(
                sock,
                fb,
                this.extractHost(path, headers),
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
      const targetHost = this.extractHost(path, headers);

      if (method === 'CONNECT') {
        client.write('HTTP/1.1 200 Connection established\r\n\r\n');
        let firstReq = true;
        await bidirectionalPipe(
          client,
          winner.socket,
          (chunk) => this.onChunk('sent', user.username, targetHost, chunk, firstReq && (firstReq = false, true)),
          (chunk) => this.onChunk('received', user.username, targetHost, chunk, false),
          user?.bandwidthLimit ?? undefined,
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
          targetHost,
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
      if (upstream.id !== 'fallback' && !isCustom) {
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

  private async authenticate(clientIp: string, authHeader: string | null): Promise<any | null> {
    if (!authHeader || !authHeader.startsWith('Basic ')) return null;
    try {
      const decoded = Buffer.from(authHeader.substring(6), 'base64').toString('utf8');
      const sepIdx = decoded.lastIndexOf(':');
      if (sepIdx === -1) return null;
      const rawUser = decoded.substring(0, sepIdx);
      const password = decoded.substring(sepIdx + 1);
      const username = rawUser.includes(':') ? rawUser.split(':')[0] : rawUser;

      let user = this.userListCache.get(username);
      if (!user) {
        user = await this.prisma.userProxy.findUnique({ where: { username } });
        if (user) this.userListCache.set(username, user);
      }
      if (!user || user.password !== password) return null;
      if (user.isBlocked) {
        this.logger.warn(`Blocked user ${username} attempted connection.`);
        return null;
      }
      if (user.expiresAt && new Date(user.expiresAt) < new Date()) {
        this.logger.warn(`Expired sub-user ${username} attempted connection.`);
        return null;
      }
      if (user.totalGb > 0 && user.usedGb >= user.totalGb) {
        this.logger.warn(
          `User ${username} blocked: data limit (${user.usedGb}/${user.totalGb} GB)`,
        );
        return null;
      }
      if (user.ipWhitelist && user.ipWhitelist !== '*') {
        const whitelist = user.ipWhitelist.split(',').map((s: string) => s.trim());
        if (!whitelist.includes(clientIp)) return null;
      }
      return user;
    } catch {
      return null;
    }
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
        pool = pool.filter((p) => p.country && countries.includes(p.country));
      }
      if (excludeIds.length > 0) pool = pool.filter((p) => !excludeIds.includes(p.id));
      if (pool.length > 0) {
        const selection = pool.length > 100 ? pool.slice(0, 100) : pool;
        return selection[Math.floor(Math.random() * selection.length)];
      }
      // Rien dans le cache pour cette pool/pays : le cache ne garde que le top
      // 2000 (successCount desc) TOUTES pools confondues, donc une petite pool
      // dédiée (peu de trafic → successCount bas) peut s'y faire évincer par un
      // pool partagé bien plus gros sans jamais être "vide" en base. On retombe
      // sur une requête DB ciblée (indexée sur `pool`) plutôt que de déclarer
      // forfait — sinon ces utilisateurs basculent en permanence sur le
      // fallback résidentiel alors que leurs proxies sont fonctionnels.
    }

    const where: any = { isWorking: true };
    if (poolName) where.pool = poolName;
    if (excludeIds.length > 0) where.id = { notIn: excludeIds };
    if (country) {
      where.country = country.includes(',')
        ? { in: country.split(',').map((c) => c.trim().toUpperCase()) }
        : country.toUpperCase();
    }
    const proxies = await this.prisma.backendProxy.findMany({
      where,
      orderBy: [{ successCount: 'desc' }, { lastChecked: 'desc' }],
      take: 500,
    });
    if (proxies.length === 0) return null;

    const score = (p: BackendProxy) => {
      const total = p.successCount + p.failureCount;
      const rate = (p.successCount + 10) / (total + 10);
      const lat = p.averageLatency ?? 2.0;
      return rate * (1 / (lat * lat));
    };
    proxies.sort((a, b) => score(b) - score(a));
    const top = proxies.slice(0, 50);
    return this.mapDbProxy(top[Math.floor(Math.random() * top.length)]);
  }

  /** Build a synthetic UpstreamProxy from SCRAPER_PROXY env var. */
  private getFallbackUpstream(country: string | null): UpstreamProxy | null {
    let urlStr = buildProxyUrl(this.fallbackProxyUrl);
    if (!urlStr) return null;
    try {
      const u = new URL(urlStr);
      // Residential fallback: inject country in username -> "user__country__xx:pass@host"
      if (country && u.username) {
        const target = country.split(',')[0].trim().toLowerCase();
        const decodedUser = decodeURIComponent(u.username);
        u.username = `${decodedUser}__country__${target}`;
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
    if (!host) return 'google.com:80';
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
    targetHost: string,
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
    // Count the reconstructed request we forward upstream as "sent" and mark it
    // as the new request (isNewReq=true). It is written directly here, NOT
    // through the pipe, so without this the request bytes — and the request
    // count itself for HTTP traffic — would never be tallied.
    const reqBuf = Buffer.from(req, 'latin1');
    upstreamSocket.write(reqBuf);
    this.onChunk('sent', username, targetHost, reqBuf, true);

    const user = this.userListCache.get(username);
    await bidirectionalPipe(
      client,
      upstreamSocket,
      // Any further client→upstream body bytes (rare for GET) — already counted.
      (chunk) => this.onChunk('sent', username, targetHost, chunk, false),
      (chunk) => this.onChunk('received', username, targetHost, chunk, false),
      user?.bandwidthLimit ?? undefined,
    );
  }

  /**
   * Per-chunk hook called by `bidirectionalPipe`. Updates the traffic
   * accountant + performs lightweight target-blocking detection on the
   * first received chunk (mirrors `_pipe` in server.py).
   */
  private onChunk(
    direction: 'sent' | 'received',
    username: string,
    hostname: string,
    data: Buffer,
    isNewReq: boolean,
  ): void {
    const cleanHost = hostname
      .split(':')[0]
      .replace(/^https?:\/\//, '')
      .split('/')[0];
    this.traffic.logTraffic(
      username,
      cleanHost,
      direction === 'sent' ? data.length : 0,
      direction === 'received' ? data.length : 0,
      isNewReq,
    );
    if (isNewReq && direction === 'received' && data.length > 20) {
      const snip = data.subarray(0, 1024).toString('latin1').toLowerCase();
      let reason: string | null = null;
      if (snip.includes('403 forbidden')) reason = '403 Forbidden';
      else if (snip.includes('captcha') || snip.includes('google.com/sorry'))
        reason = 'Captcha detected';
      else if (snip.includes('geo-blocked') || snip.includes('not available in your country'))
        reason = 'Geo-blocked';
      if (reason) this.logger.warn(`Target blocking on ${cleanHost}: ${reason}`);
    }
  }
}
