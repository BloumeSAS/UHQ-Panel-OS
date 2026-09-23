import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';

/**
 * Module de l'extension "prometheus-metrics". Volontairement minimal — pas
 * de service dédié, `MetricsController` réutilise `PrismaService` et
 * `ProxyServerService` (tous deux `@Global()`, déjà dans le graphe).
 */
@Module({
  controllers: [MetricsController],
})
export class MetricsModule {}
