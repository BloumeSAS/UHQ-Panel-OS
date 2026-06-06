import { Module } from '@nestjs/common';
import { PanelSubUserController } from './controllers/proxies.controller';

/** CRUD des comptes proxy (UserProxy) côté panel admin. */
@Module({
  controllers: [PanelSubUserController],
})
export class ProxiesModule {}
