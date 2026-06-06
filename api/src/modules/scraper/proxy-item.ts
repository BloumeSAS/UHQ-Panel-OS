export interface ProxyItem {
  ip: string;
  port: number;
  protocol: string; // "http" | "socks4" | "socks5"
  country?: string | null;
  provider?: string | null;
  auth?: string | null;
}

export function urlOf(p: ProxyItem): string {
  return p.auth ? `${p.protocol}://${p.auth}@${p.ip}:${p.port}` : `${p.protocol}://${p.ip}:${p.port}`;
}
