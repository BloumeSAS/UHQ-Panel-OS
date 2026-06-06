import { Module } from '@nestjs/common';
import { PanelSettingsController } from './controllers/settings.controller';
import { MailModule } from '../mail/mail.module';

/** Lecture/écriture de la configuration du site (admin). */
@Module({
  imports: [MailModule],
  controllers: [PanelSettingsController],
})
export class SettingsApiModule {}
