import { Module } from '@nestjs/common';
import { PanelSettingsController } from './controllers/settings.controller';
import { MailModule } from '../mail/mail.module';
import { BackupModule } from '../backup/backup.module';

/** Lecture/écriture de la configuration du site (admin). */
@Module({
  imports: [MailModule, BackupModule],
  controllers: [PanelSettingsController],
})
export class SettingsApiModule {}
