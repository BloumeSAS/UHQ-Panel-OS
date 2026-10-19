import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { SubUserController } from './sub-user.controller';
import { CommonController } from './common.controller';
import { StatsController } from './stats.controller';
import { MeApiController } from './me-api.controller';
import { VitrineController } from './vitrine.controller';

@Module({
  controllers: [UserController, SubUserController, CommonController, StatsController, MeApiController, VitrineController],
})
export class V1ApiModule {}
