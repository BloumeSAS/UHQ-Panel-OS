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
    const isAuto = this.protocol === 'auto';

    if (!hasCustomPattern) {
      const parsed = parseProxyList(text);
      return parsed.map((p) => ({
        ip: p.ip,
        port: p.port,
        // Si 'auto' ou si le contenu indique explicitement le protocole, on le
        // respecte. Sinon on applique le protocole configuré sur la source.
        protocol: isAuto || p.schemeGiven ? p.protocol : this.protocol,
        country: null,
        provider: this.name,
        auth: p.auth,
      }));
    }

    // Regex personnalisée : les groupes 1/2 ne transportent pas le protocole,
    // donc on utilise le protocole configuré (fallback http si 'auto').
    const effectiveProtocol = isAuto ? 'http' : this.protocol;
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
      out.push({ ip, port, protocol: effectiveProtocol, country: null, provider: this.name });
    }
    return out;
  }
}
