import { Injectable, Logger } from '@nestjs/common';
import { ProxyAgent, request } from 'undici';
import { SettingsService } from '../../../config/settings.service';

/**
 * Port of `app/utils/geo.py::GeoResolver`. Resolves IP → country code in
 * batches of 100 via ip-api.com. Uses a process-level cache + optional
 * MaxMind local DB (TODO: add `geoip-lite` or `maxmind` npm bindings).
 */
@Injectable()
export class GeoResolver {
  private readonly logger = new Logger(GeoResolver.name);
  private readonly cache = new Map<string, string>();
  private readonly batchSize = 100;
  private readonly maxConcurrency = 50;
  private inflight = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly settings: SettingsService) {}

  /** Resolve a list of IPs. Returns a `{ ip: countryCode }` map. */
  async resolveBatch(ips: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const toResolve: string[] = [];
    for (const ip of ips) {
      const cached = this.cache.get(ip);
      if (cached) {
        out[ip] = cached;
      } else {
        toResolve.push(ip);
      }
    }
    if (toResolve.length === 0) return out;

    this.logger.log(`Resolving ${toResolve.length} IPs (concurrency=${this.maxConcurrency})`);
    const proxy = this.settings.get('scraperProxy') || null;
    let dispatcher: ProxyAgent | undefined;
    if (proxy) {
      try { dispatcher = new ProxyAgent(proxy); } catch { /* URL invalide, requête directe */ }
    }

    const batches: string[][] = [];
    for (let i = 0; i < toResolve.length; i += this.batchSize) {
      batches.push(toResolve.slice(i, i + this.batchSize));
    }
    await Promise.all(batches.map((b) => this.resolveOne(b, out, dispatcher)));
    return out;
  }

  /** Populate cache externally (used by ScraperManager warm-up). */
  prime(ip: string, country: string): void {
    this.cache.set(ip, country);
  }

  private async acquire(): Promise<void> {
    if (this.inflight < this.maxConcurrency) {
      this.inflight += 1;
      return;
    }
    await new Promise<void>((r) => this.waiters.push(r));
    this.inflight += 1;
  }
  private release(): void {
    this.inflight -= 1;
    const w = this.waiters.shift();
    if (w) w();
  }

  private async resolveOne(
    batch: string[],
    out: Record<string, string>,
    dispatcher: any,
  ): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.acquire();
      try {
        const body = JSON.stringify(
          batch.map((ip) => ({ query: ip, fields: 'query,countryCode,status' })),
        );
        const res = await request('http://ip-api.com/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          dispatcher,
          headersTimeout: 30_000,
          bodyTimeout: 30_000,
        });
        if (res.statusCode === 200) {
          const data = (await res.body.json()) as any[];
          for (const item of data) {
            if (item.status === 'success' && item.query && item.countryCode) {
              this.cache.set(item.query, item.countryCode);
              out[item.query] = item.countryCode;
            }
          }
          // NB: release happens in `finally` — do NOT release here too, or the
          // semaphore double-decrements and the concurrency cap stops working.
          return;
        }
        if (res.statusCode === 429) {
          await new Promise((r) => setTimeout(r, 20_000 * (attempt + 1)));
        } else {
          await new Promise((r) => setTimeout(r, 2_000));
        }
      } catch (e) {
        if (attempt === 2) this.logger.error(`Geo batch failed: ${e}`);
      } finally {
        this.release();
      }
    }
  }
}

/**
 * Minimal port of `CountryMapper`. Returns alpha-2 codes; for names we keep
 * the original string (the Python version uses `pycountry` for fuzzy lookup).
 */
export class CountryMapper {
  static toCode(input?: string | null): string {
    if (!input) return 'Unknown';
    const s = input.trim();
    if (s.length === 2) return s.toUpperCase();
    return s; // Caller may add an offline lookup table later.
  }
}
