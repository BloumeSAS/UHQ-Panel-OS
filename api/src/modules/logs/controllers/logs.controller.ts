import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { LogLevel } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { RingBufferLogger } from '../ring-buffer.logger';
import { resolveLogDir } from '../file-appender';
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
  @Roles('ADMIN', 'SUPPORT')
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
   * Liste les fichiers de logs déjà écrits sur disque par le FileAppender
   * (combined-*.log / error-*.log — rotation 30 jours). Le buffer mémoire
   * (`GET /logs`) ne couvre que les 2000 dernières entrées depuis le dernier
   * redémarrage du process ; ces fichiers couvrent l'historique complet tant
   * que `/app/logs` est monté en volume Docker.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPPORT')
  @Get('files')
  listFiles() {
    const dir = resolveLogDir();
    let files: { name: string; sizeBytes: number; modifiedAt: string }[] = [];
    try {
      files = fs
        .readdirSync(dir)
        .filter((name) => name.endsWith('.log'))
        .map((name) => {
          const stat = fs.statSync(path.join(dir, name));
          return { name, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() };
        })
        .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    } catch {
      // Répertoire pas encore créé (aucune ligne écrite depuis le boot) — liste vide, pas une erreur.
    }
    return { status: 'success', data: files };
  }

  /**
   * Retourne les N dernières lignes d'un fichier de log (tail), ou le
   * fichier entier si `tail` est absent. `path.basename` neutralise toute
   * tentative de traversée de chemin dans `filename` (même correctif que
   * `BackupService.restoreBackup`/`deleteBackup`).
   */
  @ApiParam({ name: 'filename', description: 'Nom du fichier (ex. combined-2026-09-17.log)' })
  @ApiQuery({ name: 'tail', required: false, type: Number, description: 'Nombre de dernières lignes à retourner (défaut : tout le fichier)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPPORT')
  @Get('files/:filename')
  readFile(@Param('filename') filename: string, @Query('tail') tail?: string) {
    const safeName = path.basename(filename);
    if (!safeName.endsWith('.log')) throw new NotFoundException('Fichier introuvable');
    const filePath = path.join(resolveLogDir(), safeName);
    if (!fs.existsSync(filePath)) throw new NotFoundException('Fichier introuvable');
    const content = fs.readFileSync(filePath, 'utf8');
    if (!tail) return { status: 'success', filename: safeName, content };
    const n = Math.max(1, parseInt(tail, 10) || 500);
    const lines = content.split('\n');
    const start = Math.max(0, lines.length - n - 1); // -1 : la dernière ligne est souvent vide (trailing \n)
    return { status: 'success', filename: safeName, content: lines.slice(start).join('\n') };
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
    if (!user || !user.isActive || (user.role !== 'ADMIN' && user.role !== 'SUPPORT')) {
      throw new UnauthorizedException(t('errors.adminOnly'));
    }
  }
}
