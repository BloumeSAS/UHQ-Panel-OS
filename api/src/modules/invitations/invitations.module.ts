import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [InvitationsController],
})
export class InvitationsModule {}
