import { Global, Module } from '@nestjs/common';
import { VpnService } from './vpn.service';
import { VpnController } from './vpn.controller';

@Global()
@Module({
  providers: [VpnService],
  controllers: [VpnController],
  exports: [VpnService],
})
export class VpnModule {}
