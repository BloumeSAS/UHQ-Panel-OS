import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from '../../config/settings.service';

type PoolEndpoint = { domain: string | null; port: number | null };

/**
 * Cœur synchrone de la résolution host:port — pas d'accès DB ici, le pool
 * (si pertinent) doit déjà avoir été chargé par l'appelant. Permet aux
 * endpoints qui listent PLUSIEURS comptes de batcher les pools en une seule
 * requête (cf. `buildPoolEndpointMap`) au lieu d'une requête par compte.
 */
export function resolveHostPortSync(
  settings: SettingsService,
  user: { domain?: string | null; port?: number | null; pool?: string | null },
  pool?: PoolEndpoint | null,
): { host: string; port: string } {
  const host = user.domain || pool?.domain || settings.get('publicProxyHost');
  const port = String(user.port || pool?.port || settings.get('publicProxyPort'));
  return { host, port };
}

/**
 * Résout le host:port affiché dans les listes/connexions d'UN compte : son
 * propre domaine/port dédié, sinon ceux de sa pool (si assignée), sinon les
 * valeurs globales (Settings > Proxy public — `publicProxyHost`/`Port`).
 * Purement informatif (DNS) — ne reflète/n'affecte pas le bind réseau réel du
 * moteur (cf. `proxy-engine/proxy-server.service.ts`).
 *
 * Pour résoudre une LISTE de comptes, préférer `buildPoolEndpointMap` +
 * `resolveHostPortSync` (une seule requête pool au lieu d'une par compte).
 */
export async function resolveConnectionEndpoint(
  prisma: PrismaService,
  settings: SettingsService,
  user: { domain?: string | null; port?: number | null; pool?: string | null },
): Promise<{ host: string; port: string }> {
  let pool: PoolEndpoint | null = null;
  if (user.pool) {
    pool = await prisma.proxyPool.findUnique({
      where: { name: user.pool },
      select: { domain: true, port: true },
    });
  }
  return resolveHostPortSync(settings, user, pool);
}

/** Pré-charge en une requête les pools référencés par une liste de comptes. */
export async function buildPoolEndpointMap(
  prisma: PrismaService,
  poolNames: Array<string | null | undefined>,
): Promise<Map<string, PoolEndpoint>> {
  const names = Array.from(new Set(poolNames.filter((n): n is string => !!n)));
  if (names.length === 0) return new Map();
  const pools = await prisma.proxyPool.findMany({
    where: { name: { in: names } },
    select: { name: true, domain: true, port: true },
  });
  return new Map(pools.map((p) => [p.name, { domain: p.domain, port: p.port }]));
}
