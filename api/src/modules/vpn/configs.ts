/**
 * Détection et conversion des configurations VPN :
 *  - OpenVPN (.ovpn)          → tunnel noyau géré par OpenVPN ;
 *  - WireGuard (.conf)        → sing-box (endpoint wireguard, userspace) ;
 *  - liens vless:// vmess:// trojan:// ss:// hy2:// hysteria2:// → sing-box (outbound correspondant).
 * Tout vient de sources non fiables (listes publiques) : on ne conserve que ce dont on a besoin et on retire les directives OpenVPN qui
 * exécuteraient des commandes.
 */
export type VpnKind = 'openvpn' | 'wireguard' | 'link';

export interface ParsedVpn {
  kind: VpnKind;
  config: string;
  /** Serveur distant (pour l'affichage / dédoublonnage). */
  host: string;
  port: number;
  name?: string;
}

/**
 * LISTE BLANCHE des directives OpenVPN acceptées. Les configurations viennent de listes publiques non fiables et OpenVPN est ensuite lancé
 * avec des privilèges élevés : tout ce qui n'est pas explicitement connu et inoffensif est supprimé (exécution de commandes, plugins, inclusion
 * ou lecture de fichiers locaux, scripts, gestion à distance…). Les directives qui référencent un fichier (ca/cert/key/tls-auth/auth-user-pass
 * avec chemin) sont aussi retirées : seuls les blocs en ligne <ca>, <cert>, <key>, <tls-auth>, <tls-crypt>, <tls-crypt-v2> sont conservés.
 */
const OVPN_ALLOWED = new Set([
  'client', 'tls-client', 'pull', 'proto', 'remote', 'port', 'rport', 'nobind', 'persist-key', 'resolv-retry', 'cipher', 'data-ciphers',
  'data-ciphers-fallback', 'ncp-ciphers', 'auth', 'verb', 'mute', 'key-direction', 'remote-cert-tls', 'remote-cert-ku', 'remote-cert-eku',
  'ns-cert-type', 'verify-x509-name', 'comp-lzo', 'compress', 'keepalive', 'ping', 'ping-restart', 'ping-exit', 'tls-cipher', 'tls-ciphersuites',
  'tls-version-min', 'tls-version-max', 'tls-cert-profile', 'reneg-sec', 'tun-mtu', 'link-mtu', 'mssfix', 'fragment', 'sndbuf', 'rcvbuf', 'float',
  'explicit-exit-notify', 'remote-random', 'connect-retry', 'connect-retry-max', 'connect-timeout', 'server-poll-timeout', 'single-session',
  'allow-compression', 'auth-retry', 'multihome', 'key-method', 'tran-window', 'hand-window', 'replay-window', 'engine-none',
]);
const OVPN_BLOCKS = new Set(['ca', 'cert', 'key', 'tls-auth', 'tls-crypt', 'tls-crypt-v2']);
const OVPN_SAFE_ARG = /^[A-Za-z0-9_.:,+\/=@-]*$/;

/** Nettoie un .ovpn (liste blanche). Lève une erreur si un bloc en ligne est mal fermé ou non autorisé. */
export function sanitizeOvpn(text: string): string {
  const out: string[] = [];
  let inBlock: string | null = null;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (inBlock) {
      if (new RegExp(`^</${inBlock}>$`, 'i').test(line)) {
        out.push(line);
        inBlock = null;
      } else if (/^<\/?[a-z]/i.test(line)) {
        throw new Error('bloc OpenVPN invalide');
      } else {
        out.push(line); // contenu PEM / clé
      }
      continue;
    }
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const open = /^<([a-z0-9-]+)>$/i.exec(line);
    if (open) {
      const tag = open[1].toLowerCase();
      if (!OVPN_BLOCKS.has(tag)) {
        // Bloc inconnu (ex. <connection>, <extra-certs>) : on refuse tout le fichier plutôt que de deviner.
        throw new Error(`bloc OpenVPN non autorisé : <${tag}>`);
      }
      inBlock = tag;
      out.push(`<${tag}>`);
      continue;
    }
    // « --option » autorisé dans un fichier : on normalise ; guillemets / échappements : directive ignorée.
    const norm = line.replace(/^--/, '');
    if (/["'\\`$;|&<>]/.test(norm)) continue;
    const parts = norm.split(/\s+/);
    const name = parts[0].toLowerCase();
    if (!OVPN_ALLOWED.has(name)) continue;
    if (!parts.slice(1).every((a) => OVPN_SAFE_ARG.test(a))) continue;
    out.push([name, ...parts.slice(1)].join(' '));
  }
  if (inBlock) throw new Error('bloc OpenVPN non fermé');
  return out.join('\n').trim() + '\n';
}

function ovpnRemote(text: string): { host: string; port: number } {
  const m = /^\s*remote\s+(\S+)(?:\s+(\d+))?/im.exec(text);
  const port = /^\s*port\s+(\d+)/im.exec(text);
  return { host: m?.[1] ?? '', port: Number(m?.[2] ?? port?.[1] ?? 1194) };
}

function parseWireGuard(text: string): ParsedVpn | null {
  if (!/\[Interface\]/i.test(text) || !/\[Peer\]/i.test(text)) return null;
  const ep = /^\s*Endpoint\s*=\s*(.+?)\s*$/im.exec(text)?.[1] ?? '';
  const i = ep.lastIndexOf(':');
  return { kind: 'wireguard', config: text.trim() + '\n', host: i > 0 ? ep.slice(0, i).replace(/^\[|\]$/g, '') : ep, port: i > 0 ? Number(ep.slice(i + 1)) : 51820 };
}

function b64decode(s: string): string {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function parseLink(line: string): ParsedVpn | null {
  const l = line.trim();
  const scheme = /^([a-z0-9]+):\/\//i.exec(l)?.[1]?.toLowerCase();
  if (!scheme || !['vless', 'vmess', 'trojan', 'ss', 'hy2', 'hysteria2'].includes(scheme)) return null;
  try {
    if (scheme === 'vmess') {
      const j = JSON.parse(b64decode(l.slice(8)));
      return { kind: 'link', config: l, host: String(j.add ?? ''), port: Number(j.port ?? 443), name: j.ps };
    }
    if (scheme === 'ss') {
      const u = ssUrl(l);
      return u ? { kind: 'link', config: l, host: u.host, port: u.port, name: u.name } : null;
    }
    const u = new URL(l);
    return { kind: 'link', config: l, host: u.hostname, port: Number(u.port || 443), name: decodeURIComponent(u.hash.replace(/^#/, '')) || undefined };
  } catch {
    return null;
  }
}

function ssUrl(l: string): { method: string; password: string; host: string; port: number; name?: string } | null {
  const noScheme = l.slice(5);
  const hashIdx = noScheme.indexOf('#');
  const name = hashIdx >= 0 ? decodeURIComponent(noScheme.slice(hashIdx + 1)) : undefined;
  const main = (hashIdx >= 0 ? noScheme.slice(0, hashIdx) : noScheme).split('?')[0];
  let creds: string;
  let hostPort: string;
  if (main.includes('@')) {
    const at = main.lastIndexOf('@');
    creds = main.slice(0, at);
    hostPort = main.slice(at + 1);
    if (!creds.includes(':')) creds = b64decode(creds);
  } else {
    const dec = b64decode(main);
    const at = dec.lastIndexOf('@');
    if (at < 0) return null;
    creds = dec.slice(0, at);
    hostPort = dec.slice(at + 1);
  }
  const c = creds.indexOf(':');
  const p = hostPort.lastIndexOf(':');
  if (c < 0 || p < 0) return null;
  return { method: creds.slice(0, c), password: creds.slice(c + 1), host: hostPort.slice(0, p).replace(/^\[|\]$/g, ''), port: Number(hostPort.slice(p + 1)), name };
}

/** Découpe un texte collé (plusieurs liens, un ou plusieurs fichiers) en configurations reconnues. */
export function parseVpnText(text: string): ParsedVpn[] {
  const out: ParsedVpn[] = [];
  const t = text.replace(/\r/g, '');
  // Blocs OpenVPN : de « client » / première directive jusqu'au prochain </ca>… difficile à couper : on accepte UN .ovpn par appel.
  if (/^\s*(client|remote\s+\S+)/im.test(t) && /^\s*remote\s+\S+/im.test(t) && /<ca>|^\s*ca\s+/im.test(t)) {
    try {
      const clean = sanitizeOvpn(t);
      const r = ovpnRemote(clean);
      if (r.host) out.push({ kind: 'openvpn', config: clean, host: r.host, port: r.port });
    } catch {
      /* configuration refusée : rien n'est importé */
    }
    return out;
  }
  if (/\[Interface\]/i.test(t)) {
    const wg = parseWireGuard(t);
    if (wg) out.push(wg);
    return out;
  }
  for (const line of t.split('\n')) {
    const p = parseLink(line);
    if (p && p.host) out.push(p);
  }
  return out;
}

export function ovpnEndpoint(config: string): { host: string; port: number } {
  return ovpnRemote(config);
}

// ───────────────────────────── sing-box ─────────────────────────────

function tlsFrom(params: URLSearchParams, defaults: { enabled: boolean; server?: string }): Record<string, unknown> | undefined {
  const security = params.get('security') ?? (defaults.enabled ? 'tls' : 'none');
  if (security === 'none') return undefined;
  const tls: Record<string, any> = { enabled: true };
  const sni = params.get('sni') ?? params.get('peer') ?? params.get('host') ?? defaults.server;
  if (sni) tls.server_name = sni;
  if (params.get('allowInsecure') === '1' || params.get('insecure') === '1') tls.insecure = true;
  const alpn = params.get('alpn');
  if (alpn) tls.alpn = alpn.split(',');
  const fp = params.get('fp');
  if (fp || security === 'reality') tls.utls = { enabled: true, fingerprint: fp || 'chrome' };
  if (security === 'reality') tls.reality = { enabled: true, public_key: params.get('pbk') ?? '', short_id: params.get('sid') ?? '' };
  return tls;
}

function transportFrom(params: URLSearchParams): Record<string, unknown> | undefined {
  const type = params.get('type') ?? 'tcp';
  if (type === 'ws') {
    const host = params.get('host');
    return { type: 'ws', path: params.get('path') || '/', ...(host ? { headers: { Host: host } } : {}) };
  }
  if (type === 'grpc') return { type: 'grpc', service_name: params.get('serviceName') ?? params.get('path') ?? '' };
  if (type === 'httpupgrade') return { type: 'httpupgrade', path: params.get('path') || '/', host: params.get('host') || undefined };
  if (type === 'http' || type === 'h2') return { type: 'http', path: params.get('path') || '/', host: params.get('host') ? [params.get('host')] : undefined };
  return undefined;
}

/** Sortie sing-box d'un lien (hors WireGuard). */
function linkOutbound(link: string): Record<string, unknown> {
  const scheme = /^([a-z0-9]+):\/\//i.exec(link)![1].toLowerCase();
  if (scheme === 'vmess') {
    const j = JSON.parse(b64decode(link.slice(8)));
    const p = new URLSearchParams();
    if (j.tls === 'tls') p.set('security', 'tls');
    if (j.sni) p.set('sni', j.sni);
    if (j.host) p.set('host', j.host);
    if (j.path) p.set('path', j.path);
    if (j.net) p.set('type', j.net);
    if (j.fp) p.set('fp', j.fp);
    return {
      type: 'vmess', tag: 'proxy', server: j.add, server_port: Number(j.port), uuid: j.id, security: j.scy || 'auto', alter_id: Number(j.aid || 0),
      ...(tlsFrom(p, { enabled: false, server: j.add }) ? { tls: tlsFrom(p, { enabled: false, server: j.add }) } : {}),
      ...(transportFrom(p) ? { transport: transportFrom(p) } : {}),
    };
  }
  if (scheme === 'ss') {
    const u = ssUrl(link)!;
    return { type: 'shadowsocks', tag: 'proxy', server: u.host, server_port: u.port, method: u.method, password: u.password };
  }
  const u = new URL(link);
  const params = u.searchParams;
  const base = { tag: 'proxy', server: u.hostname, server_port: Number(u.port || 443) };
  if (scheme === 'vless') {
    const tls = tlsFrom(params, { enabled: false, server: u.hostname });
    const tr = transportFrom(params);
    return { type: 'vless', ...base, uuid: decodeURIComponent(u.username), ...(params.get('flow') ? { flow: params.get('flow') } : {}), ...(tls ? { tls } : {}), ...(tr ? { transport: tr } : {}) };
  }
  if (scheme === 'trojan') {
    const tls = tlsFrom(params, { enabled: true, server: u.hostname });
    const tr = transportFrom(params);
    return { type: 'trojan', ...base, password: decodeURIComponent(u.username), ...(tls ? { tls } : {}), ...(tr ? { transport: tr } : {}) };
  }
  // hy2 / hysteria2
  const tls = tlsFrom(params, { enabled: true, server: u.hostname }) ?? { enabled: true, server_name: u.hostname };
  return { type: 'hysteria2', ...base, password: decodeURIComponent(u.username || u.password), tls };
}

function wireGuardEndpoint(conf: string): Record<string, unknown> {
  const section = (name: string): Record<string, string> => {
    const m = new RegExp(`\\[${name}\\]([\\s\\S]*?)(?=\\n\\[|$)`, 'i').exec(conf);
    const o: Record<string, string> = {};
    for (const line of (m?.[1] ?? '').split('\n')) {
      const i = line.indexOf('=');
      if (i > 0) o[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
    return o;
  };
  const itf = section('Interface');
  const peer = section('Peer');
  const ep = peer.endpoint ?? '';
  const i = ep.lastIndexOf(':');
  return {
    type: 'wireguard',
    tag: 'proxy',
    address: (itf.address ?? '10.0.0.2/32').split(',').map((s) => s.trim()),
    private_key: itf.privatekey,
    mtu: itf.mtu ? Number(itf.mtu) : 1280,
    peers: [
      {
        address: ep.slice(0, i).replace(/^\[|\]$/g, ''),
        port: Number(ep.slice(i + 1)),
        public_key: peer.publickey,
        ...(peer.presharedkey ? { pre_shared_key: peer.presharedkey } : {}),
        allowed_ips: (peer.allowedips ?? '0.0.0.0/0, ::/0').split(',').map((s) => s.trim()),
        ...(peer.persistentkeepalive ? { persistent_keepalive_interval: Number(peer.persistentkeepalive) } : {}),
      },
    ],
  };
}

/** Configuration sing-box complète : entrée SOCKS5 locale → sortie VPN. */
export function singBoxConfig(kind: VpnKind, config: string, port: number): Record<string, unknown> {
  const proxy = kind === 'wireguard' ? wireGuardEndpoint(config) : linkOutbound(config.trim());
  return {
    log: { level: 'warn' },
    dns: { servers: [{ type: 'local', tag: 'local' }] },
    inbounds: [{ type: 'socks', tag: 'in', listen: '127.0.0.1', listen_port: port }],
    ...(kind === 'wireguard' ? { endpoints: [proxy] } : { outbounds: [proxy] }),
    route: { final: 'proxy', default_domain_resolver: 'local' },
  };
}

/** Libellé de protocole affiché dans le pool (le proxy réel est un SOCKS5 local ; l'utilisateur voit le vrai protocole du VPN). */
export function protocolLabel(kind: VpnKind, config: string): string {
  if (kind === 'openvpn') return 'openvpn';
  if (kind === 'wireguard') return 'wireguard';
  const scheme = /^([a-z0-9]+):\/\//i.exec(config.trim())?.[1]?.toLowerCase() ?? 'link';
  return scheme === 'hysteria2' ? 'hy2' : scheme;
}

/** Contenu d'une page / d'un abonnement : texte brut, liste de liens, ou liste encodée en base64 (format « subscription »). */
export function parseSubscription(body: string): ParsedVpn[] {
  const direct = parseVpnText(body);
  if (direct.length) return direct;
  const compact = body.replace(/\s+/g, '');
  if (compact.length > 40 && /^[A-Za-z0-9+/=_-]+$/.test(compact)) {
    try {
      const dec = Buffer.from(compact.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      return parseVpnText(dec);
    } catch {
      return [];
    }
  }
  // Page HTML : on cherche les liens dans le texte (entités HTML décodées a minima).
  const text = body.replace(/&amp;/g, '&').replace(/&#x2F;/g, '/').replace(/<[^>]+>/g, '\n');
  return parseVpnText(text);
}
