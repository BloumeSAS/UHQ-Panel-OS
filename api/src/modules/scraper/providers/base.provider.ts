import { Logger } from '@nestjs/common';
import { ProxyAgent, request } from 'undici';
import { ProxyItem } from '../proxy-item';
import { parseProxyLine } from '../../../common/utils/proxy-parse';

/**
 * Equivalent of `app/scraper/providers/base.py::BaseProxyProvider`. Concrete
 * providers implement `fetch()` and return a list of `ProxyItem`.
 */
export abstract class BaseProxyProvider {
  protected readonly logger: Logger;
  /** Outbound scraper proxy URL (residential fallback, etc.) */
  public proxy: string | null = null;

  constructor(public readonly name: string) {
    this.logger = new Logger(`Scraper:${name}`);
  }

  abstract fetch(): Promise<ProxyItem[]>;

  /** Helper: fetch a URL (optionally through `this.proxy`) and return text. */
  protected async fetchText(url: string, timeoutMs = 30_000): Promise<string> {
    const dispatcher = this.proxy ? new ProxyAgent(this.proxy) : undefined;
    const res = await request(url, {
      method: 'GET',
      dispatcher,
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
    if (res.statusCode >= 400) {
      throw new Error(`${url} returned ${res.statusCode}`);
    }
    return await res.body.text();
  }

  protected async fetchJson<T = any>(url: string, timeoutMs = 30_000): Promise<T> {
    const dispatcher = this.proxy ? new ProxyAgent(this.proxy) : undefined;
    const res = await request(url, {
      method: 'GET',
      dispatcher,
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
    if (res.statusCode >= 400) {
      throw new Error(`${url} returned ${res.statusCode}`);
    }
    return (await res.body.json()) as T;
  }

  /** Parse proxy lines in all standard formats. Skips malformed entries silently. */
  protected parseLines(
    text: string,
    protocol: string,
    country: string | null = null,
  ): ProxyItem[] {
    const out: ProxyItem[] = [];
    for (const raw of text.split(/\r?\n/)) {
      const p = parseProxyLine(raw);
      if (!p) continue;
      out.push({
        ip: p.ip,
        port: p.port,
        protocol: protocol || p.protocol,
        country,
        provider: this.name,
        auth: p.auth,
      });
    }
    return out;
  }
}
