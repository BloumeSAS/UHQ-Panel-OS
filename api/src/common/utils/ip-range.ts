/** Plages IPv4 publiées par Cloudflare (https://www.cloudflare.com/ips-v4). Sert à détecter un domaine « proxifié » (nuage orange). */
const CLOUDFLARE_V4 = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18',
  '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17',
  '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
];

function ipv4ToInt(ip: string): number | null {
  const p = ip.split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const x of p) {
    const v = Number(x);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

export function isCloudflareIp(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  return CLOUDFLARE_V4.some((cidr) => {
    const [base, bits] = cidr.split('/');
    const b = ipv4ToInt(base)!;
    const size = 2 ** (32 - Number(bits));
    return n >= b && n < b + size;
  });
}

/** Adresse privée / locale (pas joignable depuis Internet). */
export function isPrivateIp(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return ip === '::1' || ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd');
  return (
    ip.startsWith('10.') || ip.startsWith('127.') || ip.startsWith('192.168.') ||
    (n >= ipv4ToInt('172.16.0.0')! && n <= ipv4ToInt('172.31.255.255')!) || ip.startsWith('169.254.')
  );
}
