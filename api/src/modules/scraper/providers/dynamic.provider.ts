import { BaseProxyProvider } from './base.provider';
import { ProxyItem } from '../proxy-item';
import { parseProxyList } from '../../../common/utils/proxy-parse';

/**
 * Provider générique piloté par la config (table `ScraperSource`).
 * Récupère une URL puis extrait les proxies via une regex à 2 groupes de
 * capture (ip, port). Sans regex fournie, une extraction `ip:port` par défaut
 * est appliquée. C'est la seule source de proxies hors IA (Groq).
 */
export class DynamicProvider extends BaseProxyProvider {
  // ip suivie d'un séparateur (:, espace, tab…) puis le port.
  private static readonly DEFAULT_PATTERN =
    '(\\d{1,3}(?:\\.\\d{1,3}){3})[\\s:|,]+(\\d{2,5})';

  constructor(
    name: string,
    private readonly url: string,
    private readonly protocol: string,
    private readonly pattern?: string | null,
  ) {
    super(name);
  }

  async fetch(): Promise<ProxyItem[]> {
    const text = await this.fetchText(this.url);
    const hasCustomPattern = !!this.pattern?.trim();
    if (!hasCustomPattern) {
      const parsed = parseProxyList(text);
      return parsed.map((p) => ({
        ip: p.ip,
        port: p.port,
        protocol: this.protocol,
        country: null,
        provider: this.name,
        auth: p.auth,
      }));
    }

    const source = this.pattern!.trim();
    let re: RegExp;
    try {
      re = new RegExp(source, 'g');
    } catch (e) {
      this.logger.warn(`Regex invalide pour ${this.name}: ${e}`);
      return [];
    }
    const out: ProxyItem[] = [];
    const seen = new Set<string>();
    for (const m of text.matchAll(re)) {
      const ip = m[1];
      const port = parseInt(m[2], 10);
      if (!ip || !port || port < 1 || port > 65535) continue;
      const key = `${ip}:${port}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ip, port, protocol: this.protocol, country: null, provider: this.name });
    }
    return out;
  }
}
