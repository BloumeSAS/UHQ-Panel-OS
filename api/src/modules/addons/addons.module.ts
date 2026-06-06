import { Module } from '@nestjs/common';
import { AddonsService } from './addons.service';
import { AddonsController } from './addons.controller';

@Module({
  controllers: [AddonsController],
  providers: [AddonsService],
  exports: [AddonsService],
})
export class AddonsModule {}
