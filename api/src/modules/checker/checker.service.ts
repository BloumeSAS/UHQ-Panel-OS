import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
  private readonly timeoutMs = 5_000;
  // Concurrence et intervalle lus depuis la config DB (fallback env).
  private get concurrency(): number {
    return this.settings.getNumber('checkerConcurrency');
  }
  private get intervalSec(): number {
    return this.settings.getNumber('proxyCheckInterval');
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
      const rawCandidates = await this.prisma.backendProxy.findMany({
        where: { isBlacklisted: false },
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
   * Liveness check, then — only if alive — probe the real exit country so we
   * never pay the country round-trip on the (majority) dead proxies.
   */
  private async checkSingle(proxy: UpstreamProxy): Promise<{ alive: boolean; country: string | null }> {
    const alive = await this.connectCheck(proxy);
    if (!alive) return { alive: false, country: null };
    const country = await this.probeExitCountry(proxy).catch(() => null);
    return { alive: true, country };
  }

  /** HTTPS CONNECT to google.com:443 — proxy is "working" if the handshake passes. */
  private async connectCheck(proxy: UpstreamProxy): Promise<boolean> {
    let socket: Socket | null = null;
    try {
      socket = await tcpConnect(proxy.ip, proxy.port, this.timeoutMs);
      await performHandshake(socket, proxy, 'google.com:443', this.timeoutMs);
      return true;
    } catch {
      return false;
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
            data: { isWorking: false, lastChecked: new Date() },
          }),
        );
      }
      if (aliveNoCountry.length > 0) {
        await this.prisma.withRetry(() =>
          this.prisma.backendProxy.updateMany({
            where: { id: { in: aliveNoCountry } },
            data: { isWorking: true, lastChecked: new Date() },
          }),
        );
      }
      for (const [cc, ids] of byCountry) {
        for (let i = 0; i < ids.length; i += 1000) {
          const slice = ids.slice(i, i + 1000);
          await this.prisma.withRetry(() =>
            this.prisma.backendProxy.updateMany({
              where: { id: { in: slice } },
              data: { isWorking: true, lastChecked: new Date(), country: cc },
            }),
          );
        }
      }
    } catch (e) {
      this.logger.error(`Committer batch failed: ${e}`);
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
}
