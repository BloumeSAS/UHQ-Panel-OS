import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { SettingsService } from '../../../config/settings.service';
import { ProxyServerService } from '../../proxy-engine/proxy-server.service';
import { buildStickyList, formatSubUser, randomString } from '../../../common/utils/proxy-format';
import { PanelSubUserCreateDto, PanelSubUserUpdatePortDto } from '../dto';
import { SetBlockedDto, BulkSubUsersDto } from '../../../common/dto/panel.dto';
import { t } from '../../../common/utils/i18n';
import { assertPortAvailable } from '../../../common/utils/port-validation';

/**
 * Gestion des comptes proxy (UserProxy) côté panel admin, en JWT.
 * Réutilise la même logique que l'API legacy /api/v1/sub-user (Basic Auth).
 */
@ApiTags('panel-subusers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api/panel/subusers')
export class PanelSubUserController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly engine: ProxyServerService,
  ) {}

  @Get()
  async list() {
    const users = await this.prisma.userProxy.findMany({ orderBy: { createdAt: 'desc' } });
    const active = this.engine.getActiveThreads();
    return {
      status: 'success',
      data: users.map((u) => ({ ...formatSubUser(u), port: u.port ?? null, active_threads: active.get(u.username) ?? 0 })),
    };
  }

  @Post()
  async create(@Body() dto: PanelSubUserCreateDto) {
    if (dto.port != null) await assertPortAvailable(this.prisma, dto.port);
    const user = await this.prisma.userProxy.create({
      data: {
        username: dto.username || `u_${randomString(8)}`,
        password: dto.password || randomString(16),
        name: dto.label,
        ipWhitelist: dto.allowed_ips,
        threadsLimit: dto.threads_limit,
        trafficLimit: dto.traffic_limit_bytes ? BigInt(dto.traffic_limit_bytes) : null,
        totalGb: dto.traffic_limit_bytes ? dto.traffic_limit_bytes / 1024 ** 3 : 0,
        countryFilter: dto.country_filter,
        stickySessionTtl: dto.sticky_session_ttl,
        customProxies: dto.custom_proxies?.trim() || null,
        bandwidthLimit: dto.bandwidth_limit || null,
        expiresAt: dto.expires_at ? new Date(dto.expires_at) : null,
        tags: dto.tags || null,
        pool: dto.pool || null,
        port: dto.port ?? null,
      },
    });
    if (dto.port != null) this.engine.invalidatePortCache();
    return { status: 'success', data: { ...formatSubUser(user), port: user.port ?? null } };
  }

  /**
   * Opérations en masse sur plusieurs comptes proxy.
   * Déclaré avant les routes `:id` (route littérale prioritaire).
   */
  @Post('bulk')
  async bulk(@Body() dto: BulkSubUsersDto) {
    if (!dto.ids?.length) throw new BadRequestException('No sub-user IDs provided');
    const targets = await this.prisma.userProxy.findMany({
      where: { id: { in: dto.ids } },
      select: { username: true },
    });
    switch (dto.action) {
      case 'block':
        await this.prisma.userProxy.updateMany({ where: { id: { in: dto.ids } }, data: { isBlocked: true } });
        break;
      case 'unblock':
        await this.prisma.userProxy.updateMany({ where: { id: { in: dto.ids } }, data: { isBlocked: false } });
        break;
      case 'reset-traffic':
        await this.prisma.userProxy.updateMany({
          where: { id: { in: dto.ids } },
          data: { totalBytesSent: 0n, totalBytesReceived: 0n, usedGb: 0 },
        });
        break;
      case 'delete':
        await this.prisma.userProxy.deleteMany({ where: { id: { in: dto.ids } } });
        break;
      default:
        throw new BadRequestException(`Unknown action: ${dto.action}`);
    }
    for (const u of targets) this.engine.invalidateUserCache(u.username);
    return { status: 'success', affected: dto.ids.length };
  }

  @ApiParam({ name: 'id', description: 'ID du sous-utilisateur proxy' })
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: PanelSubUserUpdatePortDto) {
    if (dto.port != null) await assertPortAvailable(this.prisma, dto.port, { table: 'user', id });
    const data: any = {};
    if (dto.label !== undefined) data.name = dto.label;
    if (dto.allowed_ips !== undefined) data.ipWhitelist = dto.allowed_ips;
    if (dto.threads_limit !== undefined) data.threadsLimit = dto.threads_limit;
    if (dto.traffic_limit_bytes !== undefined) {
      data.trafficLimit = BigInt(dto.traffic_limit_bytes);
      data.totalGb = dto.traffic_limit_bytes / 1024 ** 3;
    }
    if (dto.country_filter !== undefined) data.countryFilter = dto.country_filter;
    if (dto.password !== undefined) data.password = dto.password;
    if (dto.sticky_session_ttl !== undefined) data.stickySessionTtl = dto.sticky_session_ttl;
    if (dto.custom_proxies !== undefined) data.customProxies = dto.custom_proxies.trim() || null;
    if (dto.bandwidth_limit !== undefined) data.bandwidthLimit = dto.bandwidth_limit || null;
    if (dto.expires_at !== undefined) data.expiresAt = dto.expires_at ? new Date(dto.expires_at) : null;
    if (dto.tags !== undefined) data.tags = dto.tags || null;
    if (dto.pool !== undefined) data.pool = dto.pool || null;
    if (dto.port !== undefined) data.port = dto.port;
    try {
      const user = await this.prisma.userProxy.update({ where: { id }, data });
      this.engine.invalidateUserCache(user.username);
      if (dto.port !== undefined) this.engine.invalidatePortCache();
      return { status: 'success', data: { ...formatSubUser(user), port: user.port ?? null } };
    } catch {
      throw new NotFoundException(t('errors.proxyNotFound'));
    }
  }

  @ApiParam({ name: 'id', description: 'ID du sous-utilisateur proxy' })
  @Post(':id/set-blocked')
  async setBlocked(@Param('id') id: string, @Body() body: SetBlockedDto) {
    try {
      const user = await this.prisma.userProxy.update({
        where: { id },
        data: { isBlocked: !!body.is_blocked },
      });
      this.engine.invalidateUserCache(user.username);
      return { status: 'success', data: { ...formatSubUser(user), port: user.port ?? null } };
    } catch {
      throw new NotFoundException(t('errors.proxyNotFound'));
    }
  }

  /** Réinitialise les compteurs de trafic d'un compte (bytes + usedGb → 0). */
  @ApiParam({ name: 'id', description: 'ID du sous-utilisateur proxy' })
  @Post(':id/reset-traffic')
  async resetTraffic(@Param('id') id: string) {
    try {
      const user = await this.prisma.userProxy.update({
        where: { id },
        data: { totalBytesSent: 0n, totalBytesReceived: 0n, usedGb: 0 },
      });
      this.engine.invalidateUserCache(user.username);
      return { status: 'success', data: { ...formatSubUser(user), port: user.port ?? null } };
    } catch {
      throw new NotFoundException(t('errors.proxyNotFound'));
    }
  }

  @ApiParam({ name: 'id', description: 'ID du sous-utilisateur proxy' })
  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      const user = await this.prisma.userProxy.findUnique({ where: { id } });
      if (!user) throw new NotFoundException(t('errors.proxyNotFound'));
      await this.prisma.userProxy.delete({ where: { id } });
      this.engine.invalidateUserCache(user.username);
      if (user.port != null) this.engine.invalidatePortCache();
      return { status: 'success' };
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      throw new NotFoundException(t('errors.proxyNotFound'));
    }
  }

  @ApiParam({ name: 'id', description: 'ID du sous-utilisateur proxy' })
  @ApiQuery({ name: 'count', required: false, type: Number, description: 'Nombre de proxies à générer (1-1000, défaut 100)' })
  @Get(':id/sticky-list')
  async stickyList(@Param('id') id: string, @Query('count') count = '100') {
    const user = await this.prisma.userProxy.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(t('errors.proxyNotFound'));
    const c = Math.max(1, Math.min(1000, parseInt(count, 10) || 100));
    return {
      status: 'success',
      format: 'host:port:username:session:password',
      count: c,
      proxies: buildStickyList(user, this.settings.get('publicProxyHost'), this.settings.get('publicProxyPort'), c),
    };
  }
}
