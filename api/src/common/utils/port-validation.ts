import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { t } from './i18n';

/** Port d'écoute par défaut du moteur proxy (cf. proxy-engine/proxy-server.service.ts). */
export function defaultProxyPort(): number {
  return Number(process.env.PROXY_PORT ?? 990);
}

/**
 * Plage de ports dédiés acceptée — doit correspondre à ce qui est PUBLIÉ dans
 * docker-compose.yml (`ports:` + `PROXY_PORT_RANGE`), sinon le port choisi
 * serait injoignable depuis l'extérieur. Défaut 9000-9999 si non défini.
 */
export function allowedPortRange(): { min: number; max: number } {
  const raw = process.env.PROXY_PORT_RANGE;
  const m = raw?.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  return { min: 9000, max: 9999 };
}

/**
 * Vérifie qu'un port dédié peut être assigné à une pool ou un compte proxy :
 * dans la plage publiée par Docker, pas le port par défaut, pas déjà pris par
 * une AUTRE pool ou un AUTRE compte (Prisma ne peut pas garantir l'unicité
 * cross-table, donc check manuel ici).
 */
export async function assertPortAvailable(
  prisma: PrismaService,
  port: number,
  exclude?: { table: 'pool' | 'user'; id: string },
): Promise<void> {
  const { min, max } = allowedPortRange();
  if (port < min || port > max) {
    throw new BadRequestException(t('errors.portOutOfRange'));
  }
  if (port === defaultProxyPort()) {
    throw new BadRequestException(t('errors.portReserved'));
  }
  const [poolHit, userHit] = await Promise.all([
    prisma.proxyPool.findFirst({
      where: {
        port,
        ...(exclude?.table === 'pool' ? { id: { not: exclude.id } } : {}),
      },
    }),
    prisma.userProxy.findFirst({
      where: {
        port,
        ...(exclude?.table === 'user' ? { id: { not: exclude.id } } : {}),
      },
    }),
  ]);
  if (poolHit || userHit) {
    throw new BadRequestException(t('errors.portTaken'));
  }
}
