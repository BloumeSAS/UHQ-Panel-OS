import { sanitizeOvpn, ovpnEndpoint } from './configs';

export interface VpnGateServer {
  host: string;
  ip: string;
  score: number;
  ping: number;
  /** bits/s */
  speed: number;
  country: string;
  countryCode: string;
  sessions: number;
  uptimeMs: number;
  operator: string;
  /** Config .ovpn nettoyée. */
  config: string;
  port: number;
}

const API = 'https://www.vpngate.net/api/iphone/';
let cache: { at: number; list: VpnGateServer[] } | null = null;

/** Parse le CSV « iphone » de VPNGate (liste publique de serveurs OpenVPN bénévoles). */
export function parseVpnGateCsv(csv: string): VpnGateServer[] {
  const out: VpnGateServer[] = [];
  for (const line of csv.split(/\r?\n/)) {
    if (!line || line.startsWith('*') || line.startsWith('#')) continue;
    const c = line.split(',');
    if (c.length < 15) continue;
    const b64 = c[14];
    let config = '';
    try {
      config = sanitizeOvpn(Buffer.from(b64, 'base64').toString('utf8'));
    } catch {
      continue;
    }
    if (!/^\s*remote\s+/im.test(config)) continue;
    const ep = ovpnEndpoint(config);
    out.push({
      host: c[0],
      ip: c[1],
      score: Number(c[2]) || 0,
      ping: Number(c[3]) || 0,
      speed: Number(c[4]) || 0,
      country: c[5],
      countryCode: (c[6] || '').toUpperCase(),
      sessions: Number(c[7]) || 0,
      uptimeMs: Number(c[8]) || 0,
      operator: c[12] || '',
      config,
      port: ep.port,
    });
  }
  return out;
}

/** Liste complète (mémorisée 10 min). */
export async function fetchVpnGate(force = false): Promise<VpnGateServer[]> {
  if (!force && cache && Date.now() - cache.at < 10 * 60_000) return cache.list;
  const res = await fetch(API, { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'Mozilla/5.0 UHQ-Panel' } });
  if (!res.ok) throw new Error(`VPNGate HTTP ${res.status}`);
  const list = parseVpnGateCsv(await res.text());
  if (list.length === 0) throw new Error('VPNGate : liste vide');
  cache = { at: Date.now(), list };
  return list;
}

/** Pays disponibles (code, nom, nombre de serveurs). */
export function vpnGateCountries(list: VpnGateServer[]): { code: string; name: string; servers: number }[] {
  const m = new Map<string, { code: string; name: string; servers: number }>();
  for (const s of list) {
    if (!s.countryCode) continue;
    const e = m.get(s.countryCode) ?? { code: s.countryCode, name: s.country, servers: 0 };
    e.servers += 1;
    m.set(s.countryCode, e);
  }
  return [...m.values()].sort((a, b) => b.servers - a.servers);
}

/** Meilleurs serveurs : filtre pays, trié par score décroissant, `perCountry` par pays (0 = tous les serveurs du pays). */
export function pickVpnGate(list: VpnGateServer[], countries: string[], perCountry: number): VpnGateServer[] {
  const wanted = new Set(countries.map((c) => c.trim().toUpperCase()).filter(Boolean));
  const byCountry = new Map<string, VpnGateServer[]>();
  for (const s of list) {
    if (wanted.size && !wanted.has(s.countryCode)) continue;
    (byCountry.get(s.countryCode) ?? byCountry.set(s.countryCode, []).get(s.countryCode)!).push(s);
  }
  const out: VpnGateServer[] = [];
  for (const arr of byCountry.values()) {
    arr.sort((a, b) => b.score - a.score);
    out.push(...perCountry > 0 ? arr.slice(0, perCountry) : arr);
  }
  return out;
}
