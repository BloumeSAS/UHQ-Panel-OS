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
import { ApiBasicAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { MasterKeyGuard } from '../../common/guards/master-key.guard';
import { Scopes } from '../../common/decorators/scopes.decorator';
import { PrismaService } from '../../database/prisma.service';
import { ProxyServerService } from '../proxy-engine/proxy-server.service';
import { buildStickyList, formatSubUser, randomString } from '../../common/utils/proxy-format';
import { buildPoolEndpointMap, resolveConnectionEndpoint, resolveHostPortSync } from '../../common/utils/connection-endpoint';
import { SettingsService } from '../../config/settings.service';
import {
  AllowedIpsAddDto,
  BlockedDomainsAddDto,
  BlockedDomainsRemoveDto,
  BlockedDomainsSetDto,
  SubUserBlockDto,
  SubUserCreateDto,
  SubUserUpdateDto,
} from './dto';
import { normalizeDomain } from '../../common/utils/proxy-format';

/** Exemple de réponse pour un compte proxy (formatSubUser) — réutilisé dans les exemples Swagger ci-dessous. */
const PROXY_EXAMPLE = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  username: 'u_ab12cd34',
  password: 'p_9f8e7d6c5b4a3210',
  label: 'My Proxy Account',
  allowed_ips: '*',
  threads_limit: 100,
  traffic_limit: 10737418240,
  country_filter: 'US,FR',
  bytes_sent: 524288000,
  bytes_received: 1048576000,
  is_blocked: false,
  sticky_session_ttl: 1800,
  custom_proxies: null,
  blocked_domains: 'exemple.com,autre.net',
  owner_id: null,
  bandwidth_limit: null,
  expires_at: null,
  tags: 'residential,fr',
  pool: null,
};

/**
 * Vue GLOBALE (tous les comptes proxy, identifiants en clair inclus) —
 * réservée à la clé API maître (admin). Une clé à portée réduite créée
 * depuis le panel ("Clés API") est TOUJOURS refusée ici par MasterKeyGuard,
 * quels que soient ses scopes — l'équivalent self-service (limité aux
 * proxies de son propriétaire) est /api/v1/me/*.
 */
@ApiTags('legacy-subuser')
@ApiSecurity('x-api-key')
@ApiBasicAuth()
@Controller('api/v1/sub-user')
@UseGuards(ApiKeyGuard, MasterKeyGuard)
export class SubUserController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ProxyServerService,
    private readonly settings: SettingsService,
  ) {}

  @ApiOperation({ summary: 'Liste TOUS les comptes proxy du panel (identifiants en clair inclus).' })
  @ApiOkResponse({ schema: { example: { status: 'success', data: [{ ...PROXY_EXAMPLE, host: 'proxy.uhq.panel', port: 990 }] } } })
  @Get('list')
  @Scopes('read:proxies')
  async list() {
    const users = await this.prisma.userProxy.findMany();
    const poolMap = await buildPoolEndpointMap(this.prisma, users.map((u) => u.pool));
    return {
      status: 'success',
      data: users.map((u) => ({
        ...formatSubUser(u),
        ...resolveHostPortSync(this.settings, u, u.pool ? poolMap.get(u.pool) : null),
      })),
    };
  }

  @ApiOperation({ summary: 'Crée un nouveau compte proxy.' })
  @ApiOkResponse({ schema: { example: { status: 'success', data: PROXY_EXAMPLE } } })
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
          blockedDomains: dto.blocked_domains || null,
        },
      });
      return { status: 'success', data: formatSubUser(user) };
    } catch (e) {
      throw new HttpException(String((e as Error).message ?? e), HttpStatus.BAD_REQUEST);
    }
  }

  @ApiOperation({ summary: 'Met à jour un compte proxy existant (champs fournis uniquement).' })
  @ApiOkResponse({ schema: { example: { status: 'success', data: PROXY_EXAMPLE } } })
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
    if (dto.blocked_domains !== undefined) data.blockedDomains = dto.blocked_domains || null;
    try {
      const user = await this.prisma.userProxy.update({ where: { id: dto.id }, data });
      this.engine.invalidateUserCache(user.username);
      return { status: 'success', data: formatSubUser(user) };
    } catch {
      throw new HttpException('Sub-user not found', HttpStatus.NOT_FOUND);
    }
  }

  @ApiOperation({ summary: 'Bloque ou débloque un compte proxy.' })
  @ApiOkResponse({ schema: { example: { status: 'success', data: { ...PROXY_EXAMPLE, is_blocked: true } } } })
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

  @ApiOperation({ summary: 'Ajoute des IPs à la liste blanche d\'un compte (fusionne avec l\'existant).' })
  @ApiOkResponse({ schema: { example: { status: 'success', data: { ...PROXY_EXAMPLE, allowed_ips: '127.0.0.1,1.1.1.1' } } } })
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
    this.engine.invalidateUserCache(updated.username);
    return { status: 'success', data: formatSubUser(updated) };
  }

  /** Ajoute des domaines à la liste des domaines bloqués de ce compte (fusionne avec l'existant). */
  @ApiOperation({ summary: 'Ajoute des domaines à la liste des domaines bloqués (fusionne avec l\'existant).' })
  @ApiOkResponse({ schema: { example: { status: 'success', data: PROXY_EXAMPLE } } })
  @Post('blocked-domains/add')
  @Scopes('write:proxies')
  async addBlockedDomains(@Body() dto: BlockedDomainsAddDto) {
    const user = await this.prisma.userProxy.findUnique({ where: { id: dto.id } });
    if (!user) throw new HttpException('Sub-user not found', HttpStatus.NOT_FOUND);

    const current = user.blockedDomains ? user.blockedDomains.split(',') : [];
    const incoming = dto.domains.map((d) => normalizeDomain(d)).filter(Boolean);
    const merged = Array.from(new Set([...current, ...incoming]));
    const updated = await this.prisma.userProxy.update({
      where: { id: dto.id },
      data: { blockedDomains: merged.join(',') },
    });
    this.engine.invalidateUserCache(updated.username);
    return { status: 'success', data: formatSubUser(updated) };
  }

  /** Retire des domaines de la liste des domaines bloqués de ce compte. */
  @ApiOperation({ summary: 'Retire des domaines de la liste des domaines bloqués.' })
  @ApiOkResponse({ schema: { example: { status: 'success', data: { ...PROXY_EXAMPLE, blocked_domains: 'autre.net' } } } })
  @Post('blocked-domains/remove')
  @Scopes('write:proxies')
  async removeBlockedDomains(@Body() dto: BlockedDomainsRemoveDto) {
    const user = await this.prisma.userProxy.findUnique({ where: { id: dto.id } });
    if (!user) throw new HttpException('Sub-user not found', HttpStatus.NOT_FOUND);

    const current = user.blockedDomains ? user.blockedDomains.split(',') : [];
    const toRemove = new Set(dto.domains.map((d) => normalizeDomain(d)).filter(Boolean));
    const remaining = current.filter((d) => !toRemove.has(d));
    const updated = await this.prisma.userProxy.update({
      where: { id: dto.id },
      data: { blockedDomains: remaining.join(',') || null },
    });
    this.engine.invalidateUserCache(updated.username);
    return { status: 'success', data: formatSubUser(updated) };
  }

  /** Remplace intégralement la liste des domaines bloqués de ce compte. */
  @ApiOperation({ summary: 'Remplace intégralement la liste des domaines bloqués (resynchronisation en un appel).' })
  @ApiOkResponse({ schema: { example: { status: 'success', data: PROXY_EXAMPLE } } })
  @Post('blocked-domains/set')
  @Scopes('write:proxies')
  async setBlockedDomains(@Body() dto: BlockedDomainsSetDto) {
    const incoming = Array.from(new Set(dto.domains.map((d) => normalizeDomain(d)).filter(Boolean)));
    try {
      const updated = await this.prisma.userProxy.update({
        where: { id: dto.id },
        data: { blockedDomains: incoming.join(',') || null },
      });
      this.engine.invalidateUserCache(updated.username);
      return { status: 'success', data: formatSubUser(updated) };
    } catch {
      throw new HttpException('Sub-user not found', HttpStatus.NOT_FOUND);
    }
  }

  /**
   * Point d'entrée public du proxy (host:port) configuré dans le panel.
   * Utilisé par les addons (ex. Orders) pour livrer des identifiants
   * `host:port:user:pass` complets après création d'un compte.
   */
  @ApiOperation({ summary: 'Point d\'entrée public du proxy (host:port) configuré dans le panel.' })
  @ApiOkResponse({ schema: { example: { status: 'success', data: { host: 'proxy.uhq.panel', port: 990 } } } })
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

  @ApiOperation({ summary: 'Statistiques d\'usage d\'un compte proxy (identifiant quelconque).' })
  @ApiQuery({ name: 'id', required: true, description: 'ID du sous-utilisateur proxy' })
  @ApiOkResponse({
    schema: {
      example: {
        status: 'success',
        data: {
          sub_user_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          total_bytes: 1572864000,
          gb_used: 1.4649,
          sent: 524288000,
          received: 1048576000,
          active_threads: 3,
          threads_limit: 100,
          host: 'proxy.uhq.panel',
          port: 990,
        },
      },
    },
  })
  @Get('usage-stat/get')
  @Scopes('read:stats')
  async usageStat(@Query('id') id: string) {
    const user = await this.prisma.userProxy.findUnique({ where: { id } });
    if (!user) throw new HttpException('Sub-user not found', HttpStatus.NOT_FOUND);
    const active = this.engine.getActiveThreads().get(user.username) ?? 0;
    const totalBytes = Number(user.totalBytesSent) + Number(user.totalBytesReceived);
    const { host, port } = await resolveConnectionEndpoint(this.prisma, this.settings, user);
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
        host,
        port,
      },
    };
  }

  @ApiOperation({ summary: 'Génère une liste de proxies "sticky session" pour un compte (identifiant quelconque).' })
  @ApiQuery({ name: 'id', required: true, description: 'ID du sous-utilisateur proxy' })
  @ApiQuery({ name: 'count', required: false, type: Number, description: 'Nombre de proxies à générer (1-1000, défaut 100)' })
  @ApiOkResponse({
    schema: {
      example: {
        status: 'success',
        format: 'host:port:username:session:password',
        count: 2,
        proxies: [
          'proxy.uhq.panel:990:u_ab12cd34:sess_1a2b3c:p_9f8e7d6c5b4a3210',
          'proxy.uhq.panel:990:u_ab12cd34:sess_4d5e6f:p_9f8e7d6c5b4a3210',
        ],
      },
    },
  })
  @Get('get-sticky-proxies')
  @Scopes('read:proxies')
  async stickyProxies(
    @Query('id') id: string,
    @Query('count') count: string = '100',
  ) {
    const c = Math.max(1, Math.min(1000, parseInt(count, 10) || 100));
    const user = await this.prisma.userProxy.findUnique({ where: { id } });
    if (!user) throw new HttpException('Sub-user not found', HttpStatus.NOT_FOUND);
    const { host, port } = await resolveConnectionEndpoint(this.prisma, this.settings, user);
    const lines = buildStickyList(user, host, port, c);
    return {
      status: 'success',
      format: 'host:port:username:session:password',
      count: lines.length,
      proxies: lines,
    };
  }
}
