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
 * Cloudflare pose son propre en-tête `CF-Connecting-IP` (IP visiteur réelle,
 * posée par l'edge Cloudflare lui-même — pas falsifiable par le client tant
 * que l'origine n'est joignable QUE via Cloudflare, cas standard d'un
 * déploiement derrière Cloudflare). On le préfère quand présent ; sinon on
 * retombe sur le calcul Express habituel.
 */
export function getClientIp(req: any): string {
  const cf = req.headers?.['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim();

  // Cloudflare Enterprise (certains plans) pose aussi celui-ci.
  const trueClientIp = req.headers?.['true-client-ip'];
  if (typeof trueClientIp === 'string' && trueClientIp.trim()) return trueClientIp.trim();

  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}
