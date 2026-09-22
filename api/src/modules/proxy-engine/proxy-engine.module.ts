import { Global, Module } from '@nestjs/common';
import { ProxyServerService } from './proxy-server.service';
import { VpnDetectionService } from './vpn-detection.service';

@Global()
@Module({
  providers: [ProxyServerService, VpnDetectionService],
  exports: [ProxyServerService, VpnDetectionService],
})
export class ProxyEngineModule {}
