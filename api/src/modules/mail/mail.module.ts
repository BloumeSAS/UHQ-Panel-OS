import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { SettingsModule } from '../../config/settings.module';
import { MailTemplatesController, AddonMailController } from './mail-templates.controller';

@Global()
@Module({
  imports: [SettingsModule],
  controllers: [MailTemplatesController, AddonMailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
