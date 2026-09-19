import { Module } from '@nestjs/common';
import { BannedIpsService } from './banned-ips.service';
import { BannedIpsController } from './banned-ips.controller';

@Module({
  providers: [BannedIpsService],
  controllers: [BannedIpsController],
})
export class BannedIpsModule {}
