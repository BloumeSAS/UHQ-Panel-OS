import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { SettingsModule } from '../../config/settings.module';

@Global()
@Module({
  imports: [SettingsModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
