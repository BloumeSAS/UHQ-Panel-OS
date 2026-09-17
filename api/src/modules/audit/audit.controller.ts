import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditService } from './audit.service';

@ApiTags('panel-audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPPORT')
@Controller('api/panel/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'action', required: false, description: 'Filtre partiel sur le nom d\'action (ex. "subuser")' })
  @ApiQuery({ name: 'userEmail', required: false, description: 'Filtre partiel sur l\'email' })
  @ApiQuery({ name: 'from', required: false, description: 'Date ISO min (createdAt >=)' })
  @ApiQuery({ name: 'to', required: false, description: 'Date ISO max (createdAt <=)' })
  @Get()
  async list(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('action') action?: string,
    @Query('userEmail') userEmail?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const result = await this.auditService.findAll(parseInt(page, 10), parseInt(limit, 10), { action, userEmail, from, to });
    return { status: 'success', ...result };
  }

  /**
   * Export CSV du résultat FILTRÉ COMPLET (pas juste la page affichée) —
   * avant, "Download CSV" n'exportait que les 50 lignes de la page courante
   * malgré son libellé. Même jeu de filtres que la liste, streamé directement.
   */
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'userEmail', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @Get('export')
  async export(
    @Res() res: Response,
    @Query('action') action?: string,
    @Query('userEmail') userEmail?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
    await this.auditService.streamCsv(res, { action, userEmail, from, to });
  }
}
