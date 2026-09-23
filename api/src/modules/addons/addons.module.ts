import { Module } from '@nestjs/common';
import { AddonsService } from './addons.service';
import { AddonsController } from './addons.controller';
import { BundledAddonsService } from './bundled-addons.service';
import { AddonProxyMiddleware } from './addon-proxy.middleware';

@Module({
  controllers: [AddonsController],
  providers: [AddonsService, BundledAddonsService, AddonProxyMiddleware],
  exports: [AddonsService, BundledAddonsService],
})
export class AddonsModule {}
