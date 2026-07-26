import { Module } from '@nestjs/common';
import { PanelMonitoringController } from './controllers/monitoring.controller';
import { PoolHealthSnapshotService } from './pool-health-snapshot.service';
import { MonitoringGateway } from './monitoring.gateway';
import { NotificationsModule } from '../notifications/notifications.module';

/** Monitoring temps réel : live, pool, pays, proxies (admin). */
@Module({
  imports: [NotificationsModule],
  controllers: [PanelMonitoringController],
  providers: [PoolHealthSnapshotService, MonitoringGateway],
  exports: [PoolHealthSnapshotService],
})
export class MonitoringModule {}
