import { Global, Module } from '@nestjs/common';
import { SettingsModule } from '../../config/settings.module';
import { NotificationService } from './notification.service';
import { NotificationsController } from './notifications.controller';

@Global()
@Module({
  imports: [SettingsModule],
  controllers: [NotificationsController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
