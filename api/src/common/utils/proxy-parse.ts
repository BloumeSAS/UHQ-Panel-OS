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
    auth = line.slice(0, at);
    line = line.slice(at + 1);
  }

  const parts = line.split(':');
  if (parts.length < 2) return null;
  const ip = parts[0].trim();
  const port = parseInt(parts[1], 10);
  if (!ip || !Number.isFinite(port) || port < 1 || port > 65535) return null;
  // ip:port:user:pass
  if (!auth && parts.length >= 4) auth = `${parts[2]}:${parts[3]}`;

  return { protocol, ip, port, auth: auth || null, schemeGiven };
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
