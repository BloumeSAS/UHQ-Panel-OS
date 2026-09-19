const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
// Simplifié (pas de validation stricte des groupes compressés "::") — suffisant
// pour rejeter du texte libre sans bloquer une IPv6 valide.
const IPV6_RE = /^[0-9a-fA-F:]{2,45}$/;

export function isValidIp(ip: string): boolean {
  const v = ip.trim();
  if (!v) return false;
  return IPV4_RE.test(v) || (v.includes(':') && IPV6_RE.test(v));
}
