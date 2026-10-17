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

/** Plages IPv6 publiées par Cloudflare (https://www.cloudflare.com/ips-v6). */
const CLOUDFLARE_V6 = ['2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32'];

function ipv6ToBig(ip: string): bigint | null {
  if (!ip.includes(':')) return null;
  let head = ip.toLowerCase().split('%')[0];
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(head);
  if (mapped) return null;
  const halves = head.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && left.length !== 8) || missing < 0) return null;
  const groups = [...left, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...right];
  let n = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    n = (n << 16n) | BigInt(parseInt(g, 16));
  }
  return n;
}

export function isCloudflareIp(ipIn: string): boolean {
  const ip = ipIn.replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, '$1');
  const big = ipv6ToBig(ip);
  if (big !== null) {
    return CLOUDFLARE_V6.some((cidr) => {
      const [base, bits] = cidr.split('/');
      const shift = BigInt(128 - Number(bits));
      return big >> shift === ipv6ToBig(base)! >> shift;
    });
  }
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
