import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBasicAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { Scopes } from '../../common/decorators/scopes.decorator';
import { PrismaService } from '../../database/prisma.service';
import { ProxyServerService } from '../proxy-engine/proxy-server.service';
import { buildStickyList, formatSubUser, normalizeDomain } from '../../common/utils/proxy-format';
import { buildPoolEndpointMap, resolveConnectionEndpoint, resolveHostPortSync } from '../../common/utils/connection-endpoint';
import { SettingsService } from '../../config/settings.service';
import {
  AllowedIpsAddDto,
  BlockedDomainsAddDto,
  BlockedDomainsRemoveDto,
  BlockedDomainsSetDto,
} from './dto';

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
  owner_id: 'd4738416-e27b-4d06-aecb-d7a90efdcfb7',
  bandwidth_limit: null,
  expires_at: null,
  tags: 'residential,fr',
  pool: null,
};

/**
 * Endpoints API v1 accessibles par clé API pour un simple USER.
 * Toutes les requêtes sont isolées pour ne manipuler que les proxies
 * appartenant à l'utilisateur associé à la clé API.
 */
@ApiTags('legacy-me')
@ApiSecurity('x-api-key')
@ApiBasicAuth()
@Controller('api/v1/me')
@UseGuards(ApiKeyGuard)
export class MeApiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ProxyServerService,
    private readonly settings: SettingsService,
  ) {}

  @ApiOperation({ summary: 'Solde de trafic agrégé sur tous VOS proxies.' })
  @ApiOkResponse({
    schema: {
      example: {
        status: 'success',
        data: { total_gb_used: 4.2153, total_gb_limit: 10, remaining_gb: 5.7847, status: 'active' },
      },
    },
  })
  @Get('balance')
  @Scopes('read:stats')
  async balance(@Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new HttpException('Context utilisateur manquant', HttpStatus.BAD_REQUEST);
    }
    const users = await this.prisma.userProxy.findMany({
      where: { ownerId: userId },
    });
    const totalBytes = users.reduce(
      (acc, u) => acc + Number(u.totalBytesSent) + Number(u.totalBytesReceived),
      0,
    );
    const totalLimit = users.reduce(
      (acc, u) => acc + (u.trafficLimit ? Number(u.trafficLimit) : 0),
      0,
    );
    const gbUsed = Math.round((totalBytes / 1024 ** 3) * 10000) / 10000;
    const gbLimit = totalLimit ? Math.round((totalLimit / 1024 ** 3) * 10000) / 10000 : 0;
    return {
      status: 'success',
      data: {
        total_gb_used: gbUsed,
        total_gb_limit: gbLimit,
        remaining_gb: gbLimit ? Math.max(0, gbLimit - gbUsed) : 999999,
        status: 'active',
      },
    };
  }

  @ApiOperation({ summary: 'Liste VOS proxies (host/port de connexion inclus).' })
  @ApiOkResponse({
    schema: { example: { status: 'success', data: [{ ...PROXY_EXAMPLE, host: 'proxy.uhq.panel', port: 990 }] } },
  })
  @Get('proxies')
  @Scopes('read:proxies')
  async list(@Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new HttpException('Context utilisateur manquant', HttpStatus.BAD_REQUEST);
    }
    const users = await this.prisma.userProxy.findMany({
      where: { ownerId: userId },
    });
    const poolMap = await buildPoolEndpointMap(this.prisma, users.map((u) => u.pool));
    return {
      status: 'success',
      data: users.map((u) => ({
        ...formatSubUser(u),
        ...resolveHostPortSync(this.settings, u, u.pool ? poolMap.get(u.pool) : null),
      })),
    };
  }

  @ApiOperation({ summary: 'Génère une liste de proxies "sticky session" pour un de VOS proxies.' })
  @ApiQuery({ name: 'id', required: true, description: 'ID du proxy' })
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
  @Get('proxies/sticky-list')
  @Scopes('read:proxies')
  async stickyProxies(
    @Req() req: any,
    @Query('id') id: string,
    @Query('count') count: string = '100',
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new HttpException('Context utilisateur manquant', HttpStatus.BAD_REQUEST);
    }
    const c = Math.max(1, Math.min(1000, parseInt(count, 10) || 100));
    const user = await this.prisma.userProxy.findFirst({
      where: { id, ownerId: userId },
    });
    if (!user) {
      throw new HttpException('Proxy introuvable ou non autorisé', HttpStatus.NOT_FOUND);
    }
    const { host, port } = await resolveConnectionEndpoint(this.prisma, this.settings, user);
    const lines = buildStickyList(user, host, port, c);
    return {
      status: 'success',
      format: 'host:port:username:session:password',
      count: lines.length,
      proxies: lines,
    };
  }

  @ApiOperation({ summary: 'Statistiques d\'usage de base pour un de VOS proxies.' })
  @ApiQuery({ name: 'id', required: true, description: 'ID du proxy' })
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
        },
      },
    },
  })
  @Get('proxies/stats')
  @Scopes('read:stats')
  async usageStat(@Req() req: any, @Query('id') id: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new HttpException('Context utilisateur manquant', HttpStatus.BAD_REQUEST);
    }
    const user = await this.prisma.userProxy.findFirst({
      where: { id, ownerId: userId },
    });
    if (!user) {
      throw new HttpException('Proxy introuvable ou non autorisé', HttpStatus.NOT_FOUND);
    }
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

  // ─── Écriture, limitée aux proxies possédés par la clé courante ────────────
  // Seule action de gestion accessible à une clé à portée réduite (pas de
  // create/delete/limits — juste ce qu'un utilisateur doit pouvoir ajuster
  // lui-même sur SES comptes : IP autorisées et domaines bloqués).

  private async ownedProxy(userId: string, id: string) {
    const user = await this.prisma.userProxy.findFirst({ where: { id, ownerId: userId } });
    if (!user) throw new HttpException('Proxy introuvable ou non autorisé', HttpStatus.NOT_FOUND);
    return user;
  }

  @ApiOperation({ summary: 'Ajoute des IPs à la liste blanche de VOTRE proxy (fusionne avec l\'existant).' })
  @ApiOkResponse({ schema: { example: { status: 'success', data: { ...PROXY_EXAMPLE, allowed_ips: '127.0.0.1,1.1.1.1' } } } })
  @Post('proxies/allowed-ips/add')
  @HttpCode(200)
  @Scopes('write:proxies')
  async addAllowedIps(@Req() req: any, @Body() dto: AllowedIpsAddDto) {
    const userId = req.user?.id;
    if (!userId) throw new HttpException('Context utilisateur manquant', HttpStatus.BAD_REQUEST);
    const user = await this.ownedProxy(userId, dto.id);
    const current = user.ipWhitelist && user.ipWhitelist !== '*' ? user.ipWhitelist.split(',') : [];
    const merged = Array.from(new Set([...current, ...dto.ips]));
    const updated = await this.prisma.userProxy.update({
      where: { id: dto.id },
      data: { ipWhitelist: merged.join(',') },
    });
    this.engine.invalidateUserCache(updated.username);
    return { status: 'success', data: formatSubUser(updated) };
  }

  @ApiOperation({ summary: 'Ajoute des domaines à la liste des domaines bloqués de VOTRE proxy (fusionne avec l\'existant).' })
  @ApiOkResponse({ schema: { example: { status: 'success', data: PROXY_EXAMPLE } } })
  @Post('proxies/blocked-domains/add')
  @HttpCode(200)
  @Scopes('write:proxies')
  async addBlockedDomains(@Req() req: any, @Body() dto: BlockedDomainsAddDto) {
    const userId = req.user?.id;
    if (!userId) throw new HttpException('Context utilisateur manquant', HttpStatus.BAD_REQUEST);
    const user = await this.ownedProxy(userId, dto.id);
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

  @ApiOperation({ summary: 'Retire des domaines de la liste des domaines bloqués de VOTRE proxy.' })
  @ApiOkResponse({ schema: { example: { status: 'success', data: { ...PROXY_EXAMPLE, blocked_domains: 'autre.net' } } } })
  @Post('proxies/blocked-domains/remove')
  @HttpCode(200)
  @Scopes('write:proxies')
  async removeBlockedDomains(@Req() req: any, @Body() dto: BlockedDomainsRemoveDto) {
    const userId = req.user?.id;
    if (!userId) throw new HttpException('Context utilisateur manquant', HttpStatus.BAD_REQUEST);
    const user = await this.ownedProxy(userId, dto.id);
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

  @ApiOperation({ summary: 'Remplace intégralement la liste des domaines bloqués de VOTRE proxy.' })
  @ApiOkResponse({ schema: { example: { status: 'success', data: PROXY_EXAMPLE } } })
  @Post('proxies/blocked-domains/set')
  @HttpCode(200)
  @Scopes('write:proxies')
  async setBlockedDomains(@Req() req: any, @Body() dto: BlockedDomainsSetDto) {
    const userId = req.user?.id;
    if (!userId) throw new HttpException('Context utilisateur manquant', HttpStatus.BAD_REQUEST);
    await this.ownedProxy(userId, dto.id);
    const incoming = Array.from(new Set(dto.domains.map((d) => normalizeDomain(d)).filter(Boolean)));
    const updated = await this.prisma.userProxy.update({
      where: { id: dto.id },
      data: { blockedDomains: incoming.join(',') || null },
    });
    this.engine.invalidateUserCache(updated.username);
    return { status: 'success', data: formatSubUser(updated) };
  }
}
