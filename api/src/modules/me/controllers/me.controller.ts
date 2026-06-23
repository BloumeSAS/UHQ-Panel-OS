import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../../database/prisma.service';
import { SettingsService } from '../../../config/settings.service';
import { ProxyServerService } from '../../proxy-engine/proxy-server.service';
import { buildStickyList, formatSubUser } from '../../../common/utils/proxy-format';
import { buildPoolEndpointMap, resolveConnectionEndpoint, resolveHostPortSync } from '../../../common/utils/connection-endpoint';
import { t } from '../../../common/utils/i18n';

type Period = 'week' | 'month' | 'year' | 'all';
function periodStart(period: Period): Date {
  const now = Date.now();
  switch (period) {
    case 'week':
      return new Date(now - 7 * 86400_000);
    case 'month':
      return new Date(now - 30 * 86400_000);
    case 'year':
      return new Date(now - 365 * 86400_000);
    default:
      return new Date(2000, 0, 1);
  }
}

/** Espace utilisateur : un USER ne voit QUE les comptes proxy qui lui sont assignés. */
@ApiTags('panel-me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/panel/me')
export class PanelMeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly engine: ProxyServerService,
  ) {}

  @Get('proxies')
  async proxies(@CurrentUser() me: JwtUser) {
    const list = await this.prisma.userProxy.findMany({ where: { ownerId: me.id } });
    const poolMap = await buildPoolEndpointMap(this.prisma, list.map((u) => u.pool));
    return {
      status: 'success',
      data: list.map((u) => {
        const { host, port } = resolveHostPortSync(this.settings, u, u.pool ? poolMap.get(u.pool) : null);
        return {
          ...formatSubUser(u),
          port: u.port ?? null,
          domain: u.domain ?? null,
          effective_host: host,
          effective_port: port,
        };
      }),
    };
  }

  @ApiParam({ name: 'id', description: 'ID du sous-utilisateur proxy' })
  @ApiQuery({ name: 'period', required: false, enum: ['week', 'month', 'year', 'all'], description: 'Période de statistiques' })
  @Get('proxies/:id/usage')
  async usage(
    @CurrentUser() me: JwtUser,
    @Param('id') id: string,
    @Query('period') period: Period = 'week',
  ) {
    const proxy = await this.ownedProxy(me, id);
    const start = periodStart(period);
    const records = await this.prisma.proxyUsage.findMany({
      where: { userProxyId: proxy.id, date: { gte: start } },
      orderBy: { date: 'desc' },
    });
    const sent = records.reduce((a, r) => a + r.bytesSent, 0);
    const received = records.reduce((a, r) => a + r.bytesReceived, 0);
    const requests = records.reduce((a, r) => a + r.requests, 0);
    const active = this.engine.getActiveThreads().get(proxy.username) ?? 0;
    return {
      status: 'success',
      period,
      total_stats: {
        bytesSent: sent,
        bytesReceived: received,
        totalGb: Math.round(((sent + received) / 1024 ** 3) * 10000) / 10000,
        requests,
        active_threads: active,
        threads_limit: proxy.threadsLimit,
      },
      usage: records.slice(0, 100).map((r) => ({
        hostname: r.hostname,
        bytesSent: r.bytesSent,
        bytesReceived: r.bytesReceived,
        requests: r.requests,
        date: r.date,
      })),
    };
  }

  @ApiParam({ name: 'id', description: 'ID du sous-utilisateur proxy' })
  @ApiQuery({ name: 'count', required: false, type: Number, description: 'Nombre de proxies' })
  @Get('proxies/:id/sticky-list')
  async stickyList(
    @CurrentUser() me: JwtUser,
    @Param('id') id: string,
    @Query('count') count = '100',
  ) {
    const proxy = await this.ownedProxy(me, id);
    const c = Math.max(1, Math.min(1000, parseInt(count, 10) || 100));
    const { host, port } = await resolveConnectionEndpoint(this.prisma, this.settings, proxy);
    return {
      status: 'success',
      format: 'host:port:username:session:password',
      count: c,
      proxies: buildStickyList(proxy, host, port, c),
      // Format rotatif (pas de session : chaque nouvelle connexion sur cette
      // même ligne peut tomber sur un upstream différent) — pratique pour les
      // clients qui ne gèrent pas le host:port:user:session:pass.
      rotating_format: 'username:password@host:port',
      rotating: `${proxy.username}:${proxy.password}@${host}:${port}`,
    };
  }

  @ApiParam({ name: 'id', description: 'ID du sous-utilisateur proxy' })
  @Patch('proxies/:id')
  async updateProxy(
    @CurrentUser() me: JwtUser,
    @Param('id') id: string,
    @Body() dto: { password?: string; allowed_ips?: string; country_filter?: string },
  ) {
    const proxy = await this.ownedProxy(me, id);
    const data: any = {};
    if (dto.password !== undefined) data.password = dto.password;
    if (dto.allowed_ips !== undefined) data.ipWhitelist = dto.allowed_ips;
    if (dto.country_filter !== undefined) data.countryFilter = dto.country_filter;

    const updated = await this.prisma.userProxy.update({
      where: { id: proxy.id },
      data,
    });
    this.engine.invalidateUserCache(updated.username);
    const { host, port } = await resolveConnectionEndpoint(this.prisma, this.settings, updated);
    return {
      status: 'success',
      data: {
        ...formatSubUser(updated),
        port: updated.port ?? null,
        domain: updated.domain ?? null,
        effective_host: host,
        effective_port: port,
      },
    };
  }

  /** Charge un proxy en garantissant qu'il appartient à l'utilisateur courant. */
  private async ownedProxy(me: JwtUser, id: string) {
    const proxy = await this.prisma.userProxy.findUnique({ where: { id } });
    if (!proxy) throw new NotFoundException(t('errors.proxyNotFound'));
    if (proxy.ownerId !== me.id) throw new ForbiddenException(t('errors.proxyNotAssigned'));
    return proxy;
  }
}
