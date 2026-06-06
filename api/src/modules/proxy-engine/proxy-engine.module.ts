import { Global, Module } from '@nestjs/common';
import { ProxyServerService } from './proxy-server.service';

@Global()
@Module({
  providers: [ProxyServerService],
  exports: [ProxyServerService],
})
export class ProxyEngineModule {}
