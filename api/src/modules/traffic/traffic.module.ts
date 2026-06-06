import { Global, Module } from '@nestjs/common';
import { TrafficService } from './traffic.service';

@Global()
@Module({
  providers: [TrafficService],
  exports: [TrafficService],
})
export class TrafficModule {}
