import { Module } from '@nestjs/common';
import { CheckerService } from './checker.service';
import { CheckerController } from './controllers/checker.controller';

@Module({
  controllers: [CheckerController],
  providers: [CheckerService],
  exports: [CheckerService],
})
export class CheckerModule {}
