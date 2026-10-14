import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { SettingsModule } from '../../config/settings.module';
import { BackupModule } from '../backup/backup.module';
import { PublicStatusController, SystemController } from './system.controller';
import { SystemService } from './system.service';

/** Mise en service : checklist, diagnostic, test de compte, page d'état publique. */
@Module({
  imports: [PrismaModule, SettingsModule, BackupModule],
  controllers: [SystemController, PublicStatusController],
  providers: [SystemService],
})
export class SystemModule {}
