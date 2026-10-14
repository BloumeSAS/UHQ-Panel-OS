import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { SettingsModule } from '../../config/settings.module';
import { BackupModule } from '../backup/backup.module';
import { PublicStatusController, SystemController } from './system.controller';
import { SystemService } from './system.service';
import { SetupPreflightController } from './setup-preflight.controller';
import { HealthWatchService } from './health-watch.service';
import { CustomerAlertsService } from './customer-alerts.service';

/** Mise en service : checklist, diagnostic, test de compte, page d'état publique. */
@Module({
  imports: [PrismaModule, SettingsModule, BackupModule],
  controllers: [SystemController, PublicStatusController, SetupPreflightController],
  providers: [SystemService, HealthWatchService, CustomerAlertsService],
})
export class SystemModule {}
