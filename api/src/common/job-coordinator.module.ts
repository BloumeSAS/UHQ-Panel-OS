import { Global, Module } from '@nestjs/common';
import { JobCoordinatorService } from './job-coordinator.service';

/** Coordination scraper/checker/backup — voir job-coordinator.service.ts. */
@Global()
@Module({
  providers: [JobCoordinatorService],
  exports: [JobCoordinatorService],
})
export class JobCoordinatorModule {}
