import { Module } from '@nestjs/common';
import { PanelSubUserController } from './controllers/proxies.controller';
import { ShareLinkPublicController } from './controllers/share-link-public.controller';
import { SubUserTemplatesController } from './controllers/subuser-templates.controller';

/** CRUD des comptes proxy (UserProxy) côté panel admin. */
@Module({
  controllers: [PanelSubUserController, ShareLinkPublicController, SubUserTemplatesController],
})
export class ProxiesModule {}
