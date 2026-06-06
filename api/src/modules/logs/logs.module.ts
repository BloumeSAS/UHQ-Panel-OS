import { Module } from '@nestjs/common';
import { PanelLogsController } from './controllers/logs.controller';

/** Journaux serveur : snapshot + flux SSE temps réel (admin). */
@Module({
  controllers: [PanelLogsController],
})
export class LogsModule {}
