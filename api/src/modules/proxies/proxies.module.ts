import { Module } from '@nestjs/common';
import { PanelSubUserController } from './controllers/proxies.controller';
import { ShareLinkPublicController } from './controllers/share-link-public.controller';

/** CRUD des comptes proxy (UserProxy) côté panel admin. */
@Module({
  controllers: [PanelSubUserController, ShareLinkPublicController],
})
export class ProxiesModule {}
