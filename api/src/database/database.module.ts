import { Global, Module } from '@nestjs/common';
import { DatabaseConfigService } from './database-config.service';

@Global()
@Module({
  providers: [DatabaseConfigService],
  exports: [DatabaseConfigService],
})
export class DatabaseModule {}
