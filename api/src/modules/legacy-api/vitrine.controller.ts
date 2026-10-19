import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { MasterKeyGuard } from '../../common/guards/master-key.guard';
import { PrismaService } from '../../database/prisma.service';

/**
 * Données de la vitrine publique (addon Vitrine) : catégories et pays réellement disponibles dans le pool.
 * Clé API MAÎTRE uniquement (appel serveur-à-serveur de l'addon, jamais un navigateur) ; ne renvoie ni URL ni identifiant
 * de proxy — seulement des compteurs par catégorie et par pays.
 */
@ApiExcludeController()
@Controller('api/v1/vitrine')
@UseGuards(ApiKeyGuard, MasterKeyGuard)
export class VitrineController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  async overview() {
    const [pools, groups] = await Promise.all([
      this.prisma.proxyPool.findMany({ orderBy: { name: 'asc' }, select: { name: true, description: true, color: true } }),
      this.prisma.backendProxy.groupBy({
        by: ['pool', 'country'],
        where: { isWorking: true, isBlacklisted: false, archived: false },
        _count: { _all: true },
      }),
    ]);

    const byPool = new Map<string, Map<string, number>>();
    for (const g of groups) {
      const key = g.pool ?? '';
      const code = (g.country ?? '').trim().toUpperCase();
      const m = byPool.get(key) ?? new Map<string, number>();
      if (/^[A-Z]{2}$/.test(code)) m.set(code, (m.get(code) ?? 0) + g._count._all);
      else m.set('', (m.get('') ?? 0) + g._count._all); // pays inconnu : compté dans le total uniquement
      byPool.set(key, m);
    }

    const shape = (name: string, description: string | null, color: string | null) => {
      const m = byPool.get(name === '' ? '' : name) ?? new Map<string, number>();
      const countries = [...m.entries()]
        .filter(([c]) => c)
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count);
      const total = [...m.values()].reduce((s, n) => s + n, 0);
      return { name, description, color, total, countries };
    };

    return {
      status: 'success',
      data: {
        default: shape('', null, null),
        pools: pools.map((p) => shape(p.name, p.description, p.color)),
      },
    };
  }
}
