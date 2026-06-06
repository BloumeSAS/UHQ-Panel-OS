import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { LogLevel } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { RingBufferLogger } from '../ring-buffer.logger';
import { t } from '../../../common/utils/i18n';

@ApiTags('panel-logs')
@Controller('api/panel/logs')
export class PanelLogsController {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /** Snapshot du buffer de logs (filtre niveau optionnel). */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiQuery({ name: 'level', required: false, enum: ['log', 'error', 'warn', 'debug', 'verbose'], description: 'Filtrer par niveau de log' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre maximal d\'entrées à retourner' })
  @ApiQuery({ name: 'context', required: false, description: 'Filtrer par contexte (ex. CheckerService)' })
  @Get()
  get(
    @Query('level') level?: LogLevel,
    @Query('limit') limit?: string,
    @Query('context') context?: string,
  ) {
    return {
      status: 'success',
      data: RingBufferLogger.getEntries({
        level,
        limit: limit ? parseInt(limit, 10) : undefined,
        context,
      }),
    };
  }

  /**
   * Flux SSE temps réel. EventSource ne pose pas d'en-tête Authorization, donc
   * le token passe en query (`?token=`) et est validé ici manuellement.
   */
  @ApiQuery({ name: 'token', required: true, description: 'Token d\'authentification JWT (transmis par query pour EventSource)' })
  @Get('stream')
  async stream(@Query('token') token: string, @Req() req: Request, @Res() res: Response) {
    await this.assertAdmin(token);

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    // Backlog initial.
    for (const e of RingBufferLogger.getEntries({ limit: 100 })) {
      res.write(`data: ${JSON.stringify(e)}\n\n`);
    }

    const off = RingBufferLogger.onLog((e) => {
      res.write(`data: ${JSON.stringify(e)}\n\n`);
    });
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);

    req.on('close', () => {
      clearInterval(ping);
      off();
      res.end();
    });
  }

  private async assertAdmin(token: string): Promise<void> {
    if (!token) throw new UnauthorizedException(t('errors.tokenRequired'));
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException(t('errors.tokenInvalid'));
    }
    const user = await this.prisma.panelUser.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || user.role !== 'ADMIN') {
      throw new UnauthorizedException(t('errors.adminOnly'));
    }
  }
}
