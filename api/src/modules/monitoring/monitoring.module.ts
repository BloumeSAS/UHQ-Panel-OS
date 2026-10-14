import { Module } from '@nestjs/common';
import { PanelMonitoringController } from './controllers/monitoring.controller';
import { PoolHealthSnapshotService } from './pool-health-snapshot.service';
import { TrafficSnapshotService } from './traffic-snapshot.service';
import { MonitoringGateway } from './monitoring.gateway';
import { LiveSnapshotService } from './live-snapshot.service';
import { NotificationsModule } from '../notifications/notifications.module';

/** Monitoring temps réel : live, pool, pays, proxies (admin). */
@Module({
  imports: [NotificationsModule],
  controllers: [PanelMonitoringController],
  providers: [PoolHealthSnapshotService, TrafficSnapshotService, MonitoringGateway, LiveSnapshotService],
  exports: [PoolHealthSnapshotService, TrafficSnapshotService, LiveSnapshotService],
})
export class MonitoringModule {}
