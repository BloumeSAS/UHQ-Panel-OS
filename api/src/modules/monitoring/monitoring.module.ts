import { Module } from '@nestjs/common';
import { PanelMonitoringController } from './controllers/monitoring.controller';
import { PoolHealthSnapshotService } from './pool-health-snapshot.service';
import { MonitoringGateway } from './monitoring.gateway';

/** Monitoring temps réel : live, pool, pays, proxies (admin). */
@Module({
  controllers: [PanelMonitoringController],
  providers: [PoolHealthSnapshotService, MonitoringGateway],
  exports: [PoolHealthSnapshotService],
})
export class MonitoringModule {}
