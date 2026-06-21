import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Socket } from 'net';
import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from '../../config/settings.service';
import { performHandshake, tcpConnect } from '../proxy-engine/handshake';
import { UpstreamProxy } from '../proxy-engine/types';
import { NotificationService } from '../notifications/notification.service';

/**
 * Port of `app/proxy_engine/checker.py::ProxyChecker`. Pulls a large slice of
 * proxies (~150k) and, with `CHECKER_CONCURRENCY` workers, tests each one.
 *
 * Two-phase per proxy:
 *   1. liveness — HTTPS CONNECT to google.com:443 (unchanged definition of
 *      "working", so we never shrink the pool versus the old behaviour).
 *   2. exit country — ONLY for live proxies: fetch `http://ip-api.com/line`
 *      *through* the proxy and record the REAL exit country. This fixes the
 *      country filter, which previously matched the geo of the proxy's own IP
 *      (meaningless for Tor SOCKS / relays whose exit differs from the entry).
 *
 * Results are streamed to a decoupled committer that batches DB updates.
 */
@Injectable()
export class CheckerService implements OnModuleInit {
  private readonly logger = new Logger(CheckerService.name);
  // Concurrence, timeout et intervalle lus depuis la config DB (fallback env).
  private get concurrency(): number {
    return this.settings.getNumber('checkerConcurrency');
  }
  // Trop bas, un proxy lent (résidentiel, longue distance) est compté KO à
  // tort ; configurable car la valeur idéale dépend fortement du mix de
  // sources scrapées (datacenter rapide vs résidentiel lent).
  private get timeoutMs(): number {
    return this.settings.getPositiveNumber('checkerTimeout') * 1000;
  }
  private get intervalSec(): number {
    return this.settings.getPositiveNumber('proxyCheckInterval');
  }
  private running = false;
  private totalCount = 0;
  private processedCount = 0;
  private lastRunTimestamp: Date | null = null;
  private lastRunDurationMs = 0;
  private lastRunProcessed = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notificationService: NotificationService,
  ) {}

  onModuleInit(): void {
    setTimeout(() => this.startBackgroundLoop(), 60_000);
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.totalCount = 0;
    this.processedCount = 0;
    const startTime = Date.now();
    try {
      await this.prisma.ensureConnection();
      const skipDead = this.settings.getBool('skipDeadProxies');
      const maxRetries = this.settings.getNumber('deadProxyMaxRetries');
      const rawCandidates = await this.prisma.backendProxy.findMany({
        where: {
          isBlacklisted: false,
          ...(skipDead
            ? { OR: [{ isWorking: true }, { failCount: { lt: maxRetries } }] }
            : {}),
        },
        orderBy: { lastChecked: 'asc' },
        take: 150_000,
      });
      const candidates = rawCandidates.map((p: any) => {
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
      });
      this.totalCount = candidates.length;
      if (candidates.length === 0) {
        this.logger.log('No proxies to check.');
        return;
      }
      this.logger.log(`SpeedCheck: ${candidates.length} proxies queued`);

      const results: CheckResult[] = [];
      let cursor = 0;
      let processed = 0;
      // `workersDone` is the explicit termination signal for the committer.
      // It mirrors `asyncio.Event` used in the Python original (`checker.py`).
      let workersDone = false;

      const worker = async () => {
        while (cursor < candidates.length) {
          const p = candidates[cursor++];
          if (!p) break;
          const r = await this.checkSingle(p as UpstreamProxy);
          results.push({ id: p.id, url: p.url, ...r });
          processed += 1;
          this.processedCount = processed;
          if (processed % 1000 === 0) {
            this.logger.log(`Progress: ${processed}/${candidates.length} proxies processed`);
          }
        }
      };

      // Decoupled committer task: drains `results` in chunks of 5000 and
      // exits cleanly once workers are done AND the buffer is empty.
      const committer = (async () => {
        while (!workersDone || results.length > 0) {
          if (results.length === 0) {
            await new Promise((r) => setTimeout(r, 250));
            continue;
          }
          await this.commitBatch(results.splice(0, 5_000));
        }
      })();

      const workerTasks = Array.from({ length: this.concurrency }, () => worker());
      await Promise.all(workerTasks);
      workersDone = true;
      await committer;

      this.logger.log(`Verification cycle complete (${processed} processed).`);
      this.lastRunTimestamp = new Date();
      this.lastRunDurationMs = Date.now() - startTime;
      this.lastRunProcessed = processed;
    } finally {
      this.running = false;
    }
  }

  /**
   * On-demand single-proxy check (Pool UI "Tester" button). Runs the exact
   * same retry + latency + country logic as the bulk cycle, but persists the
   * result immediately instead of waiting for this proxy's turn in the next
   * `proxyCheckInterval` sweep.
   */
  async checkOne(id: string): Promise<{ id: string; alive: boolean; latencyMs: number | null; country: string | null }> {
    const row = await this.prisma.backendProxy.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Proxy introuvable');
    let auth: string | null = null;
    try {
      const u = new URL(row.url);
      if (u.username) auth = `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`;
    } catch {
      /* */
    }
    const result = await this.checkSingle({ ...row, auth } as UpstreamProxy);

    const data: Record<string, unknown> = {
      isWorking: result.alive,
      lastChecked: new Date(),
      failCount: result.alive ? 0 : { increment: 1 },
      successCount: result.alive ? { increment: 1 } : undefined,
      failureCount: result.alive ? undefined : { increment: 1 },
    };
    if (result.alive && result.country) data.country = result.country;
    if (result.latencyMs !== null) {
      data.averageLatency =
        row.averageLatency != null ? row.averageLatency * 0.7 + result.latencyMs * 0.3 : result.latencyMs;
    }
    for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
    await this.prisma.backendProxy.update({ where: { id }, data });

    if (!result.alive) {
      void this.notificationService.notifyProxyDead(row.url, 'Manual check failed');
    }
    return { id, alive: result.alive, latencyMs: result.latencyMs, country: result.alive ? result.country : null };
  }

  /**
   * Liveness check, then — only if alive — probe the real exit country so we
   * never pay the country round-trip on the (majority) dead proxies.
   *
   * A single failed attempt is retried once before declaring the proxy dead:
   * a transient blip (dropped SYN, momentary overload) would otherwise sink
   * a perfectly functional proxy for a full `proxyCheckInterval` cycle.
   */
  private async checkSingle(
    proxy: UpstreamProxy,
  ): Promise<{ alive: boolean; country: string | null; latencyMs: number | null }> {
    let attempt = await this.connectCheck(proxy);
    if (!attempt.alive) attempt = await this.connectCheck(proxy);
    if (!attempt.alive) return { alive: false, country: null, latencyMs: null };
    const country = await this.probeExitCountry(proxy).catch(() => null);
    return { alive: true, country, latencyMs: attempt.latencyMs };
  }

  /** HTTPS CONNECT to google.com:443 — proxy is "working" if the handshake passes. */
  private async connectCheck(proxy: UpstreamProxy): Promise<{ alive: boolean; latencyMs: number | null }> {
    const startedAt = Date.now();
    let socket: Socket | null = null;
    try {
      socket = await tcpConnect(proxy.ip, proxy.port, this.timeoutMs);
      await performHandshake(socket, proxy, 'google.com:443', this.timeoutMs);
      return { alive: true, latencyMs: Date.now() - startedAt };
    } catch {
      return { alive: false, latencyMs: null };
    } finally {
      if (socket) {
        try {
          socket.destroy();
        } catch {
          /* */
        }
      }
    }
  }

  /**
   * Fetch `http://ip-api.com/line?fields=countryCode` THROUGH the proxy and
   * return the 2-letter exit country, or null. For an HTTP proxy we send an
   * absolute-form GET directly; for SOCKS we tunnel to ip-api.com:80 first.
   * The exit country is whatever IP actually reaches ip-api — the real one.
   */
  private async probeExitCountry(proxy: UpstreamProxy): Promise<string | null> {
    let socket: Socket | null = null;
    try {
      socket = await tcpConnect(proxy.ip, proxy.port, this.timeoutMs);
      const proto = (proxy.protocol || 'http').toLowerCase();
      let request: string;
      if (proto === 'http') {
        request =
          'GET http://ip-api.com/line?fields=countryCode HTTP/1.1\r\n' +
          'Host: ip-api.com\r\nUser-Agent: uhq-checker\r\nConnection: close\r\n\r\n';
      } else {
        await performHandshake(socket, proxy, 'ip-api.com:80', this.timeoutMs);
        request =
          'GET /line?fields=countryCode HTTP/1.1\r\n' +
          'Host: ip-api.com\r\nUser-Agent: uhq-checker\r\nConnection: close\r\n\r\n';
      }
      socket.write(Buffer.from(request, 'latin1'));
      const resp = await this.collectResponse(socket, this.timeoutMs);
      if (!/^HTTP\/\d\.\d\s+200/.test(resp)) return null;
      const idx = resp.indexOf('\r\n\r\n');
      const body = idx >= 0 ? resp.slice(idx + 4).trim() : '';
      const cc = (body.split(/\s+/)[0] || '').toUpperCase();
      return /^[A-Z]{2}$/.test(cc) ? cc : null;
    } catch {
      return null;
    } finally {
      if (socket) {
        try {
          socket.destroy();
        } catch {
          /* */
        }
      }
    }
  }

  /** Collect a short HTTP response (headers + tiny body) until close/timeout. */
  private collectResponse(socket: Socket, timeoutMs: number): Promise<string> {
    return new Promise((resolve) => {
      let buf = Buffer.alloc(0);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        socket.off('data', onData);
        socket.off('end', finish);
        socket.off('error', finish);
        clearTimeout(t);
        resolve(buf.toString('latin1'));
      };
      const onData = (d: Buffer) => {
        buf = Buffer.concat([buf, d]);
        if (buf.length > 8192) finish(); // headers + a 2-byte body — more than enough
      };
      const t = setTimeout(finish, timeoutMs);
      socket.on('data', onData);
      socket.once('end', finish);
      socket.once('error', finish);
      // A preceding SOCKS handshake (readExactly/readUntil) leaves the socket
      // paused — resume explicitly or no data is ever delivered.
      socket.resume();
    });
  }

  /**
   * Batch-commit results. Alive proxies with a known exit country are grouped
   * by country (one updateMany each) so we can write the real country; alive
   * proxies without a country only flip isWorking/lastChecked (country left
   * untouched); dead proxies are marked not working.
   */
  private async commitBatch(batch: CheckResult[]): Promise<void> {
    if (batch.length === 0) return;
    const dead = batch.filter((b) => !b.alive).map((b) => b.id);
    const aliveNoCountry = batch.filter((b) => b.alive && !b.country).map((b) => b.id);
    const byCountry = new Map<string, string[]>();
    for (const b of batch) {
      if (!b.alive) {
        void this.notificationService.notifyProxyDead(b.url, 'Liveness health check failed');
      }
      if (b.alive && b.country) {
        const arr = byCountry.get(b.country) ?? [];
        arr.push(b.id);
        byCountry.set(b.country, arr);
      }
    }

    try {
      if (dead.length > 0) {
        await this.prisma.withRetry(() =>
          this.prisma.backendProxy.updateMany({
            where: { id: { in: dead } },
            data: { isWorking: false, lastChecked: new Date(), failCount: { increment: 1 } },
          }),
        );
      }
      if (aliveNoCountry.length > 0) {
        await this.prisma.withRetry(() =>
          this.prisma.backendProxy.updateMany({
            where: { id: { in: aliveNoCountry } },
            data: { isWorking: true, lastChecked: new Date(), failCount: 0 },
          }),
        );
      }
      for (const [cc, ids] of byCountry) {
        for (let i = 0; i < ids.length; i += 1000) {
          const slice = ids.slice(i, i + 1000);
          await this.prisma.withRetry(() =>
            this.prisma.backendProxy.updateMany({
              where: { id: { in: slice } },
              data: { isWorking: true, lastChecked: new Date(), country: cc, failCount: 0 },
            }),
          );
        }
      }
      await this.updateCounters(batch);
    } catch (e) {
      this.logger.error(`Committer batch failed: ${e}`);
    }
  }

  /**
   * Bulk-write per-proxy `averageLatency`/`successCount`/`failureCount`.
   * These columns are read by `ProxyServerService.getUpstreamProxy()`'s
   * scoring and by the Pool UI's latency column, but nothing in the codebase
   * ever wrote them — every proxy scored identically regardless of real
   * performance. `updateMany` can't express a distinct value per row, so this
   * uses a single `UPDATE ... FROM (VALUES ...)` per chunk instead of one
   * round-trip per proxy.
   */
  private async updateCounters(batch: CheckResult[]): Promise<void> {
    const CHUNK = 1000;
    for (let i = 0; i < batch.length; i += CHUNK) {
      const slice = batch.slice(i, i + CHUNK);
      const values: string[] = [];
      const params: unknown[] = [];
      for (const r of slice) {
        const base = params.length;
        params.push(r.id, r.latencyMs, r.alive);
        values.push(`($${base + 1}, $${base + 2}::float, $${base + 3}::boolean)`);
      }
      const sql = `
        UPDATE "BackendProxy" AS b
        SET "averageLatency" = CASE
              WHEN v.latency_ms IS NOT NULL
              THEN COALESCE(b."averageLatency" * 0.7 + v.latency_ms * 0.3, v.latency_ms)
              ELSE b."averageLatency"
            END,
            "successCount" = b."successCount" + CASE WHEN v.alive THEN 1 ELSE 0 END,
            "failureCount" = b."failureCount" + CASE WHEN v.alive THEN 0 ELSE 1 END
        FROM (VALUES ${values.join(', ')}) AS v(id, latency_ms, alive)
        WHERE b.id = v.id
      `;
      try {
        await this.prisma.withRetry(() => this.prisma.$executeRawUnsafe(sql, ...params));
      } catch (e) {
        this.logger.error(`Counters update failed: ${e}`);
      }
    }
  }

  private async startBackgroundLoop(): Promise<void> {
    while (true) {
      try {
        await this.runOnce();
      } catch (e) {
        this.logger.error(`Checker cycle error: ${e}`);
      }
      this.logger.log(`Sleeping ${this.intervalSec}s before next check cycle`);
      await new Promise((r) => setTimeout(r, this.intervalSec * 1000));
    }
  }

  getStatus() {
    return {
      running: this.running,
      total: this.totalCount,
      processed: this.processedCount,
      progress: this.totalCount > 0 ? Math.round((this.processedCount / this.totalCount) * 1000) / 10 : 0,
      lastRun: this.lastRunTimestamp,
      lastRunDurationMs: this.lastRunDurationMs,
      lastRunProcessed: this.lastRunProcessed,
    };
  }
}

interface CheckResult {
  id: string;
  url: string;
  alive: boolean;
  country: string | null;
  latencyMs: number | null;
}
