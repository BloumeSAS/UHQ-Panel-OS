import { Module } from '@nestjs/common';
import { AddonsService } from './addons.service';
import { AddonsController } from './addons.controller';
import { BundledAddonsService } from './bundled-addons.service';
import { AddonProxyMiddleware } from './addon-proxy.middleware';
import { SecurityAddonService } from './security-addon.service';

@Module({
  controllers: [AddonsController],
  providers: [AddonsService, BundledAddonsService, AddonProxyMiddleware, SecurityAddonService],
  exports: [AddonsService, BundledAddonsService, SecurityAddonService],
})
export class AddonsModule {}
