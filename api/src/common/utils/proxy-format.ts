import { randomBytes } from 'crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Chaîne aléatoire URL-safe (réutilisée pour usernames, mots de passe, sessions). */
export function randomString(len = 12): string {
  let out = '';
  const buf = randomBytes(len);
  for (let i = 0; i < len; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  return out;
}

/** Sérialisation publique d'un UserProxy (snake_case, façon API legacy). */
export function formatSubUser(u: any) {
  return {
    id: u.id,
    username: u.username,
    password: u.password,
    label: u.name,
    allowed_ips: u.ipWhitelist,
    threads_limit: u.threadsLimit,
    traffic_limit: u.trafficLimit ? Number(u.trafficLimit) : null,
    country_filter: u.countryFilter,
    bytes_sent: Number(u.totalBytesSent),
    bytes_received: Number(u.totalBytesReceived),
    is_blocked: u.isBlocked,
    sticky_session_ttl: u.stickySessionTtl,
    custom_proxies: u.customProxies ?? null,
    owner_id: u.ownerId ?? null,
    bandwidth_limit: u.bandwidthLimit ?? null,
    expires_at: u.expiresAt ?? null,
    tags: u.tags ?? null,
    pool: u.pool ?? null,
    created_at: u.createdAt,
  };
}

/** Génère `count` lignes sticky `host:port:user:session:pass`. */
export function buildStickyList(
  user: { username: string; password: string },
  host: string,
  port: string,
  count: number,
): string[] {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    lines.push(`${host}:${port}:${user.username}:${randomString(8)}:${user.password}`);
  }
  return lines;
}
