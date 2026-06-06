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
  const scheme = line.match(/^([a-z0-9]+):\/\//i);
  if (scheme) {
    protocol = normProtocol(scheme[1]);
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

  return { protocol, ip, port, auth: auth || null };
}

/** Parse une liste (texte multi-lignes) en proxies valides. */
export function parseProxyList(text: string): ParsedProxy[] {
  const out: ParsedProxy[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const p = parseProxyLine(line);
    if (!p) continue;
    const key = `${p.protocol}://${p.ip}:${p.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}
