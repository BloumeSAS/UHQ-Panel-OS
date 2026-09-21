import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from '../../config/settings.service';

/**
 * Snapshots périodiques des compteurs de trafic cumulatifs (tous comptes
 * confondus), pour permettre un graphique de volume dans le temps — même
 * principe que PoolHealthSnapshotService, mais pour la bande passante.
 */
@Injectable()
export class TrafficSnapshotService {
  private readonly logger = new Logger(TrafficSnapshotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Un snapshot toutes les 15 minutes — même cadence que PoolHealthSnapshot. */
  @Cron('*/15 * * * *')
  async snapshot() {
    try {
      const [bytes, requests] = await Promise.all([
        this.prisma.userProxy.aggregate({
          _sum: { totalBytesSent: true, totalBytesReceived: true },
        }),
        this.prisma.proxyUsage.aggregate({ _sum: { requests: true } }),
      ]);

      await this.prisma.trafficSnapshot.create({
        data: {
          totalBytesSent: bytes._sum.totalBytesSent ?? 0n,
          totalBytesReceived: bytes._sum.totalBytesReceived ?? 0n,
          totalRequests: BigInt(requests._sum.requests ?? 0),
        },
      });

      // Rétention configurable (défaut 7 jours, comme PoolHealthSnapshot).
      const retentionDays = this.settings.getPositiveNumber('trafficSnapshotRetentionDays') || 7;
      const cutoff = new Date(Date.now() - retentionDays * 24 * 3600_000);
      await this.prisma.trafficSnapshot.deleteMany({ where: { createdAt: { lt: cutoff } } });
    } catch (err) {
      this.logger.error(`Traffic snapshot failed: ${err.message}`);
    }
  }

  /**
   * Historique en DELTAS (pas les compteurs cumulatifs bruts) : chaque point
   * représente le volume/requêtes écoulés depuis le point précédent — c'est
   * ce qu'un graphique "trafic dans le temps" doit afficher.
   */
  async getHistory(hours = 24) {
    const since = new Date(Date.now() - hours * 3600_000);
    // Un point de plus avant `since` pour pouvoir calculer le delta du tout
    // premier point de la fenêtre demandée, sinon il apparaîtrait à 0.
    const anchor = await this.prisma.trafficSnapshot.findFirst({
      where: { createdAt: { lt: since } },
      orderBy: { createdAt: 'desc' },
    });
    const rows = await this.prisma.trafficSnapshot.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
    });
    const series = anchor ? [anchor, ...rows] : rows;
    if (series.length < 2) return [];

    const out: { createdAt: Date; bytesSent: number; bytesReceived: number; requests: number }[] = [];
    for (let i = 1; i < series.length; i++) {
      const prev = series[i - 1];
      const cur = series[i];
      out.push({
        createdAt: cur.createdAt,
        bytesSent: Math.max(0, Number(cur.totalBytesSent - prev.totalBytesSent)),
        bytesReceived: Math.max(0, Number(cur.totalBytesReceived - prev.totalBytesReceived)),
        requests: Math.max(0, Number(cur.totalRequests - prev.totalRequests)),
      });
    }
    return out;
  }
}
