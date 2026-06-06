import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';

/**
 * Service dédié aux snapshots périodiques de la santé du pool de proxies.
 * Chaque snapshot est persisté dans PoolHealthSnapshot.
 */
@Injectable()
export class PoolHealthSnapshotService {
  private readonly logger = new Logger(PoolHealthSnapshotService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Crée un snapshot toutes les 15 minutes. */
  @Cron('*/15 * * * *')
  async snapshot() {
    try {
      const total = await this.prisma.backendProxy.count();
      const working = await this.prisma.backendProxy.count({
        where: { isWorking: true, isBlacklisted: false },
      });
      const dead = total - working;
      const healthPct = total > 0 ? (working / total) * 100 : 0;

      await this.prisma.poolHealthSnapshot.create({
        data: { total, working, dead, healthPct },
      });

      // Nettoyer les anciens snapshots (>7 jours)
      const cutoff = new Date(Date.now() - 7 * 24 * 3600_000);
      await this.prisma.poolHealthSnapshot.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
    } catch (err) {
      this.logger.error(`Pool health snapshot failed: ${err.message}`);
    }
  }

  /** Récupère l'historique sur une période donnée. */
  async getHistory(hours = 24) {
    const since = new Date(Date.now() - hours * 3600_000);
    return this.prisma.poolHealthSnapshot.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
