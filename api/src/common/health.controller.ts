import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

/**
 * Health check. `/` est laissé au panel React (ServeStaticModule) ; le health
 * répond donc sur `/health` (et `/api/health`).
 */
@ApiTags('health')
@Controller()
export class HealthController {
  @Get(['health', 'api/health'])
  health() {
    return {
      status: 'running',
      service: 'UHQ Panel OS',
      company: 'Bloume SAS',
    };
  }
}
