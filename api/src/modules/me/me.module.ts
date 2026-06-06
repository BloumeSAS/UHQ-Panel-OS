import { Module } from '@nestjs/common';
import { PanelMeController } from './controllers/me.controller';
import { SecurityController } from './controllers/security.controller';
import { ApiKeysController } from './controllers/api-keys.controller';
import { InboxController } from './controllers/inbox.controller';

/** Espace utilisateur : proxies assignés, usage, listes sticky, 2FA, sessions, clés API, notifications. */
@Module({
  controllers: [PanelMeController, SecurityController, ApiKeysController, InboxController],
})
export class MeModule {}
