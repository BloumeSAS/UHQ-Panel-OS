import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBasicAuth, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { Scopes } from '../../common/decorators/scopes.decorator';
import { PrismaService } from '../../database/prisma.service';
import { ProxyServerService } from '../proxy-engine/proxy-server.service';
import { buildStickyList, formatSubUser, randomString } from '../../common/utils/proxy-format';
import { SettingsService } from '../../config/settings.service';
import {
  AllowedIpsAddDto,
  SubUserBlockDto,
  SubUserCreateDto,
  SubUserUpdateDto,
} from './dto';

@ApiTags('legacy-subuser')
@ApiSecurity('x-api-key')
@ApiBasicAuth()
@Controller('api/v1/sub-user')
@UseGuards(ApiKeyGuard)
export class SubUserController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ProxyServerService,
    private readonly settings: SettingsService,
  ) {}

  @Get('list')
  @Scopes('read:proxies')
  async list() {
    const users = await this.prisma.userProxy.findMany();
    return { status: 'success', data: users.map(formatSubUser) };
  }

  @Post('create')
  @Scopes('write:proxies')
  async create(@Body() dto: SubUserCreateDto) {
    const username = dto.username || `u_${randomString(8)}`;
    const password = dto.password || randomString(16);
    try {
      const user = await this.prisma.userProxy.create({
        data: {
          username,
          password,
          name: dto.label,
          ipWhitelist: dto.allowed_ips,
          threadsLimit: dto.threads_limit,
          trafficLimit: dto.traffic_limit_bytes
            ? BigInt(dto.traffic_limit_bytes)
            : null,
          totalGb: dto.traffic_limit_bytes
            ? dto.traffic_limit_bytes / 1024 ** 3
            : 0,
          countryFilter: dto.country_filter,
          stickySessionTtl: dto.sticky_session_ttl,
          customProxies: dto.custom_proxies?.trim() || null,
          bandwidthLimit: dto.bandwidth_limit || null,
          expiresAt: dto.expires_at ? new Date(dto.expires_at) : null,
          tags: dto.tags || null,
          pool: dto.pool || null,
        },
      });
      return { status: 'success', data: formatSubUser(user) };
    } catch (e) {
      throw new HttpException(String((e as Error).message ?? e), HttpStatus.BAD_REQUEST);
    }
  }

  @Post('update')
  @Scopes('write:proxies')
  async update(@Body() dto: SubUserUpdateDto) {
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
    try {
      const user = await this.prisma.userProxy.update({ where: { id: dto.id }, data });
      return { status: 'success', data: formatSubUser(user) };
    } catch {
      throw new HttpException('Sub-user not found', HttpStatus.NOT_FOUND);
    }
  }

  @Post('set-blocked')
  @Scopes('write:proxies')
  async setBlocked(@Body() dto: SubUserBlockDto) {
    try {
      const user = await this.prisma.userProxy.update({
        where: { id: dto.id },
        data: { isBlocked: dto.is_blocked },
      });
      return { status: 'success', data: formatSubUser(user) };
    } catch {
      throw new HttpException('Sub-user not found', HttpStatus.NOT_FOUND);
    }
  }

  @Post('allowed-ips/add')
  @Scopes('write:proxies')
  async addAllowedIps(@Body() dto: AllowedIpsAddDto) {
    const user = await this.prisma.userProxy.findUnique({ where: { id: dto.id } });
    if (!user) throw new HttpException('Sub-user not found', HttpStatus.NOT_FOUND);

    const current =
      user.ipWhitelist && user.ipWhitelist !== '*' ? user.ipWhitelist.split(',') : [];
    const merged = Array.from(new Set([...current, ...dto.ips]));
    const updated = await this.prisma.userProxy.update({
      where: { id: dto.id },
      data: { ipWhitelist: merged.join(',') },
    });
    return { status: 'success', data: formatSubUser(updated) };
  }

  /**
   * Point d'entrée public du proxy (host:port) configuré dans le panel.
   * Utilisé par les addons (ex. Orders) pour livrer des identifiants
   * `host:port:user:pass` complets après création d'un compte.
   */
  @Get('endpoint')
  @Scopes('read:proxies')
  proxyEndpoint() {
    return {
      status: 'success',
      data: {
        host: this.settings.get('publicProxyHost'),
        port: this.settings.get('publicProxyPort'),
      },
    };
  }

  @ApiQuery({ name: 'id', required: true, description: 'ID du sous-utilisateur proxy' })
  @Get('usage-stat/get')
  @Scopes('read:stats')
  async usageStat(@Query('id') id: string) {
    const user = await this.prisma.userProxy.findUnique({ where: { id } });
    if (!user) throw new HttpException('Sub-user not found', HttpStatus.NOT_FOUND);
    const active = this.engine.getActiveThreads().get(user.username) ?? 0;
    const totalBytes = Number(user.totalBytesSent) + Number(user.totalBytesReceived);
    return {
      status: 'success',
      data: {
        sub_user_id: user.id,
        total_bytes: totalBytes,
        gb_used: Math.round((totalBytes / 1024 ** 3) * 10000) / 10000,
        sent: Number(user.totalBytesSent),
        received: Number(user.totalBytesReceived),
        active_threads: active,
        threads_limit: user.threadsLimit,
      },
    };
  }

  @ApiQuery({ name: 'id', required: true, description: 'ID du sous-utilisateur proxy' })
  @ApiQuery({ name: 'count', required: false, type: Number, description: 'Nombre de proxies à générer (1-1000, défaut 100)' })
  @Get('get-sticky-proxies')
  @Scopes('read:proxies')
  async stickyProxies(
    @Query('id') id: string,
    @Query('count') count: string = '100',
  ) {
    const c = Math.max(1, Math.min(1000, parseInt(count, 10) || 100));
    const user = await this.prisma.userProxy.findUnique({ where: { id } });
    if (!user) throw new HttpException('Sub-user not found', HttpStatus.NOT_FOUND);
    const host = this.settings.get('publicProxyHost');
    const port = this.settings.get('publicProxyPort');
    const lines = buildStickyList(user, host, port, c);
    return {
      status: 'success',
      format: 'host:port:username:session:password',
      count: lines.length,
      proxies: lines,
    };
  }
}
