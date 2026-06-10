import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { ProxyPoolsController } from './proxy-pools.controller';
import { ProxyPoolsService } from './proxy-pools.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProxyPoolsController],
  providers: [ProxyPoolsService],
})
export class ProxyPoolsModule {}
