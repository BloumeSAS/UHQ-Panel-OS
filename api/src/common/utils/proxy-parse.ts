/**
 * Parseur d'upstream proxy (formats tolérés) :
 *   - `proto://[user:pass@]ip:port`
 *   - `user:pass@ip:port`
 *   - `ip:port`
 *   - `ip:port:user:pass`
 * Protocoles : http | socks4 | socks5 (socks4a → socks4, https → http).
 */
export interface ParsedProxy {
  protocol: string;
  ip: string;
  port: number;
  /** "user:pass" si présent, sinon null. */
  auth: string | null;
  /** true si un schéma explicite (`http://`, `socks5://`…) était présent. */
  schemeGiven: boolean;
}

function normProtocol(p: string): string {
  const x = p.toLowerCase();
  if (x.startsWith('socks5')) return 'socks5';
  if (x.startsWith('socks4')) return 'socks4';
  return 'http';
}

/** true si `s` est une IPv4 valide (4 octets 0-255, séparés par des points). */
export function isValidIPv4(s: string): boolean {
  const parts = s.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255);
}

/**
 * Cherche un couple `ip:port` valide et NON AMBIGU (collés par `:`) dans une
 * chaîne potentiellement polluée — ex. un export Tor mal scrapé
 * (`ExitAddress 1.2.3.4 2026-06-23 12:06:35`, qui n'a aucun port réel).
 * Ne renvoie quelque chose que si ip et port sont directement adjacents :
 * jamais une IP + un nombre proche par coïncidence (date, heure...).
 */
export function extractCleanIpPort(raw: string): { ip: string; port: number } | null {
  const re = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d{1,5})/g;
  for (const m of raw.matchAll(re)) {
    const port = Number(m[2]);
    if (isValidIPv4(m[1]) && port >= 1 && port <= 65535) return { ip: m[1], port };
  }
  return null;
}

/** true si `s` ressemble à un `host:port` valide (port = entier 1-65535). */
function looksLikeHostPort(s: string): boolean {
  const i = s.lastIndexOf(':');
  if (i <= 0) return false;
  const portStr = s.slice(i + 1);
  if (!/^\d+$/.test(portStr)) return false;
  const port = Number(portStr);
  return port >= 1 && port <= 65535;
}

export function parseProxyLine(raw: string): ParsedProxy | null {
  let line = raw.trim();
  if (!line || line.startsWith('#')) return null;

  let protocol = 'http';
  let schemeGiven = false;
  const scheme = line.match(/^([a-z0-9]+):\/\//i);
  if (scheme) {
    protocol = normProtocol(scheme[1]);
    schemeGiven = true;
    line = line.slice(scheme[0].length);
  }

  let auth: string | null = null;
  const at = line.lastIndexOf('@');
  if (at !== -1) {
    const before = line.slice(0, at);
    const after = line.slice(at + 1);
    // Certains fournisseurs (copier-coller malformé) donnent `host:port@user:pass`
    // au lieu du standard `user:pass@host:port`. On ne le détecte que si c'est
    // sans ambiguïté : la partie après `@` ne ressemble PAS à un host:port mais
    // celle d'avant si — sinon on garde l'interprétation standard.
    if (!looksLikeHostPort(after) && looksLikeHostPort(before)) {
      auth = after;
      line = before;
    } else {
      auth = before;
      line = after;
    }
  }

  const parts = line.split(':');
  if (parts.length < 2) return null;
  const ip = parts[0].trim();
  const portStr = parts[1];
  if (!ip || !/^\d+$/.test(portStr)) return null;
  const port = Number(portStr);
  if (port < 1 || port > 65535) return null;
  // ip:port:user:pass
  if (!auth && parts.length >= 4) auth = `${parts[2]}:${parts[3]}`;

  return { protocol, ip, port, auth: auth || null, schemeGiven };
}

/**
 * Construit une URL de proxy unique (`http://[user:pass@]host:port`) à partir
 * de n'importe quel format toléré par `parseProxyLine` — y compris l'ordre
 * inversé `host:port@user:pass`. Utilisé pour `scraperProxy` (résidentiel de
 * secours) qui est consommé directement par `new URL()` / `new ProxyAgent()`.
 * Retourne `null` si la valeur est vide ou inexploitable.
 */
export function buildProxyUrl(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const p = parseProxyLine(raw);
  if (!p) return null;
  let authPart = '';
  if (p.auth) {
    const sep = p.auth.indexOf(':');
    const user = sep === -1 ? p.auth : p.auth.slice(0, sep);
    const pass = sep === -1 ? '' : p.auth.slice(sep + 1);
    authPart = `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`;
  }
  return `${p.protocol}://${authPart}${p.ip}:${p.port}`;
}

/**
 * Retire les balises HTML d'un texte brut.
 * Permet de parser des pages web qui embarquent des proxies dans leur HTML
 * (ex : `<a href="http://1.2.3.4:8080">1.2.3.4:8080</a>`).
 */
function stripHtml(text: string): string {
  // Remplace les balises par des sauts de ligne pour ne pas fusionner les tokens
  return text.replace(/<[^>]+>/g, '\n');
}

/** Parse une liste (texte multi-lignes ou HTML) en proxies valides. */
export function parseProxyList(text: string): ParsedProxy[] {
  const clean = stripHtml(text);
  const out: ParsedProxy[] = [];
  const seen = new Set<string>();
  for (const raw of clean.split(/\r?\n/)) {
    // Les URLs de scraping contiennent parfois des paramètres (`?proxy=…`) :
    // on n'essaie pas de parser les lignes qui ressemblent à des URLs complètes
    // mais on extrait les candidats `proto://host:port` embarqués dans une ligne.
    const candidates = extractCandidates(raw);
    for (const line of candidates) {
      const p = parseProxyLine(line);
      if (!p) continue;
      const key = `${p.protocol}://${p.ip}:${p.port}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

/**
 * Extrait les candidats proxy d'une ligne de texte.
 * Cas habituels :
 *   - Ligne simple : `http://1.2.3.4:80` ou `1.2.3.4:80:user:pass`
 *   - Ligne HTML résiduelle : `  href="socks5://1.2.3.4:1080" ...`
 * Retourne au moins la ligne brute (pour ne pas casser les formats classiques).
 */
function extractCandidates(line: string): string[] {
  line = line.trim();
  if (!line || line.startsWith('#')) return [];

  // Extraction de tous les `proto://...` ou `ip:port` trouvés dans la ligne
  const schemeMatches = [...line.matchAll(/((?:https?|socks[45]?|socks4a):\/\/(?:[^\s"'<>]+))/gi)];
  if (schemeMatches.length > 0) return schemeMatches.map((m) => m[1]);

  // Ligne classique (ip:port, user:pass@ip:port, etc.)
  return [line];
}
