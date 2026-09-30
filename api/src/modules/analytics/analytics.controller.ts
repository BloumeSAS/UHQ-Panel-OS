import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AnalyticsService, clampDays, safeTz } from './analytics.service';

/**
 * Statistiques agrégées (lecture seule) — consommées par l'addon « Analyse ».
 * ADMIN + SUPPORT, comme les routes de lecture du monitoring. `days` = fenêtre
 * en jours (1-365, défaut 30) ; `tz` = fuseau IANA du navigateur (heures/jours).
 */
@ApiTags('panel-analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPPORT')
@Controller('api/panel/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @ApiQuery({ name: 'days', required: false, type: Number })
  @Get('overview')
  async overview(@Query('days') days?: string) {
    return { status: 'success', data: await this.analytics.overview(clampDays(days)) };
  }

  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiQuery({ name: 'tz', required: false, type: String })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'sort', required: false, enum: ['bytes', 'requests', 'domains', 'activeDays', 'quota', 'used', 'created', 'lastActive', 'username'] })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'status', required: false, enum: ['blocked', 'expired', 'overquota', 'nearquota', 'inactive', 'active'] })
  @Get('accounts')
  async accounts(
    @Query('days') days?: string,
    @Query('tz') tz?: string,
    @Query('q') q?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('pool') pool?: string,
    @Query('status') status?: string,
  ) {
    const data = await this.analytics.accounts({
      days: clampDays(days),
      tz: safeTz(tz),
      q,
      sort,
      order,
      limit: parseInt(limit ?? '', 10) || undefined,
      offset: parseInt(offset ?? '', 10) || undefined,
      pool,
      status,
    });
    return { status: 'success', ...data };
  }

  @Get('accounts/:id')
  async account(@Param('id') id: string, @Query('days') days?: string, @Query('tz') tz?: string) {
    return { status: 'success', data: await this.analytics.accountDetail(id, clampDays(days), safeTz(tz)) };
  }

  @Get('activity')
  async activity(
    @Query('days') days?: string,
    @Query('tz') tz?: string,
    @Query('pool') pool?: string,
    @Query('accountId') accountId?: string,
  ) {
    return {
      status: 'success',
      data: await this.analytics.activity({ days: clampDays(days), tz: safeTz(tz), pool, accountId }),
    };
  }

  @Get('categories')
  async categories(@Query('days') days?: string, @Query('tz') tz?: string) {
    return { status: 'success', data: await this.analytics.categories(clampDays(days), safeTz(tz)) };
  }

  @Get('pool')
  async pool() {
    return { status: 'success', data: await this.analytics.pool() };
  }

  @Get('checker')
  async checker(@Query('days') days?: string) {
    return { status: 'success', data: await this.analytics.checkerStats(clampDays(days)) };
  }

  @Get('scraper')
  async scraper(@Query('days') days?: string) {
    return { status: 'success', data: await this.analytics.scraperStats(clampDays(days)) };
  }

  @Get('security')
  async security(@Query('days') days?: string) {
    return { status: 'success', data: await this.analytics.security(clampDays(days)) };
  }
}
