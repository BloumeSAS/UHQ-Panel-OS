/**
 * IP client réelle d'une requête HTTP — tient compte de Cloudflare quand le
 * panel est déployé derrière (Cloudflare Proxy → Traefik/Coolify → app).
 *
 * `trust proxy: 1` (main.ts) ne fait confiance qu'à UN seul hop de reverse
 * proxy pour calculer `req.ip` depuis `X-Forwarded-For` — correct avec un
 * seul proxy devant l'app, mais avec Cloudflare EN PLUS devant ce proxy, il y
 * a deux hops réels : `req.ip` retombe alors sur l'IP de sortie Cloudflare,
 * pas sur celle du visiteur (symptôme observé : toutes les connexions
 * "viennent" des mêmes quelques IP Cloudflare).
 *
 * Cloudflare pose son propre en-tête `CF-Connecting-IP` (IP visiteur réelle),
 * mais cet en-tête n'est fiable QUE si l'origine n'est joignable QUE via
 * Cloudflare — sinon n'importe quel client peut le falsifier en frappant
 * l'origine directement (bypass de rate-limit / ban IP / audit trail). On ne
 * le fait donc JAMAIS confiance par défaut : seul un admin qui a vérifié que
 * son déploiement bloque bien le trafic direct (règle firewall/Coolify vers
 * les plages IP Cloudflare) active `trustCloudflareIps` (Paramètres →
 * Sécurité). Sans ce réglage, on retombe sur le calcul Express habituel.
 */
import { isCloudflareIp } from './ip-range';

export function getClientIp(req: any, trustCloudflareHeaders = false): string {
  if (trustCloudflareHeaders) {
    const cf = req.headers?.['cf-connecting-ip'];
    if (typeof cf === 'string' && cf.trim()) return cf.trim();

    // Cloudflare Enterprise (certains plans) pose aussi celui-ci.
    const trueClientIp = req.headers?.['true-client-ip'];
    if (typeof trueClientIp === 'string' && trueClientIp.trim()) return trueClientIp.trim();
  }

  // Détection automatique : si le dernier saut de confiance (`req.ip`, ajouté par NOTRE reverse proxy) est une IP Cloudflare
  // officielle, la requête est bien passée par Cloudflare : CF-Connecting-IP est alors fiable (un client direct ne peut pas
  // faire apparaître une IP Cloudflare comme saut ajouté par Traefik). Sinon on ignore l'en-tête.
  const hop: string | undefined = req.ip ?? req.socket?.remoteAddress;
  if (hop && isCloudflareIp(hop)) {
    const cf = req.headers?.['cf-connecting-ip'];
    if (typeof cf === 'string' && cf.trim()) return cf.trim();
    const xff = req.headers?.['x-forwarded-for'];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
    if (first) return first;
  }

  return hop ?? 'unknown';
}
