import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from '../../config/settings.service';

/**
 * Résout le host:port affiché dans les listes/connexions d'un compte : son
 * propre domaine/port dédié, sinon ceux de sa pool (si assignée), sinon les
 * valeurs globales (Settings > Proxy public — `publicProxyHost`/`Port`).
 * Purement informatif (DNS) — ne reflète/n'affecte pas le bind réseau réel du
 * moteur (cf. `proxy-engine/proxy-server.service.ts`).
 */
export async function resolveConnectionEndpoint(
  prisma: PrismaService,
  settings: SettingsService,
  user: { domain?: string | null; port?: number | null; pool?: string | null },
): Promise<{ host: string; port: string }> {
  let poolDomain: string | null = null;
  let poolPort: number | null = null;
  if (user.pool) {
    const pool = await prisma.proxyPool.findUnique({ where: { name: user.pool } });
    poolDomain = pool?.domain ?? null;
    poolPort = pool?.port ?? null;
  }
  const host = user.domain || poolDomain || settings.get('publicProxyHost');
  const port = String(user.port || poolPort || settings.get('publicProxyPort'));
  return { host, port };
}
