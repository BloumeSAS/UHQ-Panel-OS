import { Module } from '@nestjs/common';
import { PanelAuthController } from './controllers/auth.controller';
import { PanelDatabaseController } from './controllers/database.controller';
import { MailModule } from '../mail/mail.module';

/** Authentification du panel + setup (base & 1er admin). Routes publiques sous /api/panel. */
@Module({
  imports: [MailModule],
  controllers: [PanelDatabaseController, PanelAuthController],
})
export class AuthModule {}
