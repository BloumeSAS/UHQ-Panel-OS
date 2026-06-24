import { BaseProxyProvider } from './base.provider';
import { ProxyItem } from '../proxy-item';
import { isValidIPv4, parseProxyList } from '../../../common/utils/proxy-parse';

/**
 * Provider générique piloté par la config (table `ScraperSource`).
 *
 * Chaîne de détection :
 *  1. Regex personnalisée (pattern) → si 0 résultats, passe à 2
 *  2. parseProxyList (formats texte standard) → si 0 résultats, passe à 3
 *  3. Scan brut ip:port sur le texte brut (fonctionne sur HTML aussi)
 */
export class DynamicProvider extends BaseProxyProvider {
  constructor(
    name: string,
    private readonly url: string,
    private readonly protocol: string,
    private readonly pattern?: string | null,
    private readonly pool?: string | null,
  ) {
    super(name);
  }

  async fetch(): Promise<ProxyItem[]> {
    const text = await this.fetchText(this.url);
    const hasCustomPattern = !!this.pattern?.trim();
    const isAuto = this.protocol === 'auto';
    const effectiveProto = isAuto ? 'http' : this.protocol;

    // ── Étape 1 : regex personnalisée ──────────────────────────────────────
    if (hasCustomPattern) {
      const items = this.applyRegex(text, effectiveProto);
      if (items.length > 0) return items;
      this.logger.debug(`Pattern regex → 0 résultats, auto-détection activée`);
    }

    // ── Étape 2 : parseProxyList (txt, ip:port, user:pass@host:port, etc.) ─
    // Filtre IPv4 strict ici (scope scraper uniquement) : `parseProxyLine`
    // reste volontairement tolérant aux hostnames pour scraperProxy/
    // customProxies, mais une liste SCRAPÉE n'est jamais censée contenir des
    // hostnames — un texte bruité (ex. export Tor) peut sinon produire des
    // "ip:port" qui ne sont en réalité que du texte:nombre coïncidant.
    const parsed = parseProxyList(text).filter((p) => isValidIPv4(p.ip));
    if (parsed.length > 0) {
      return parsed.map((p) => ({
        ip: p.ip,
        port: p.port,
        protocol: isAuto || p.schemeGiven ? p.protocol : this.protocol,
        country: null,
        provider: this.name,
        auth: p.auth,
        pool: this.pool ?? null,
      }));
    }

    // ── Étape 3 : scan brut ip:port (fonctionne sur HTML, JSON, etc.) ──────
    return this.scanIpPort(text, effectiveProto);
  }

  private applyRegex(text: string, protocol: string): ProxyItem[] {
    let re: RegExp;
    try {
      re = new RegExp(this.pattern!.trim(), 'g');
    } catch (e) {
      this.logger.warn(`Regex invalide pour ${this.name}: ${e}`);
      return [];
    }
    const out: ProxyItem[] = [];
    const seen = new Set<string>();
    for (const m of text.matchAll(re)) {
      const ip = m[1];
      const port = parseInt(m[2], 10);
      // Une regex personnalisée à 2 groupes peut matcher n'importe quoi (ex.
      // un export Tor "ExitAddress <ip> <date>" : `m[1]` capte l'IP mais
      // `m[2]` un fragment d'heure) — on exige une IPv4 valide pour `m[1]`.
      if (!ip || !isValidIPv4(ip) || !port || port < 1 || port > 65535) continue;
      const key = `${ip}:${port}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ip, port, protocol, country: null, provider: this.name, pool: this.pool ?? null });
    }
    return out;
  }

  private scanIpPort(text: string, protocol: string): ProxyItem[] {
    const re = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d{2,5})\b/g;
    const out: ProxyItem[] = [];
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const ip = m[1];
      const port = parseInt(m[2], 10);
      if (port < 1 || port > 65535) continue;
      if (!isValidIPv4(ip)) continue;
      const key = `${ip}:${port}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ip, port, protocol, country: null, provider: this.name, pool: this.pool ?? null });
    }
    if (out.length > 0) this.logger.debug(`Scan brut trouvé ${out.length} paires ip:port`);
    return out;
  }
}
