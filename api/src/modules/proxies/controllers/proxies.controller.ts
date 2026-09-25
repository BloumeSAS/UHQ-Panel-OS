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
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../../database/prisma.service';
import { SettingsService } from '../../../config/settings.service';
import { ProxyServerService } from '../../proxy-engine/proxy-server.service';
import { buildStickyList, formatSubUser, normalizeDomain, randomString } from '../../../common/utils/proxy-format';
import { PanelSubUserCreateDto, PanelSubUserUpdatePortDto } from '../dto';
import { SetBlockedDto, BulkSubUsersDto } from '../../../common/dto/panel.dto';
import { t } from '../../../common/utils/i18n';
import { assertPortAvailable } from '../../../common/utils/port-validation';
import { buildPoolEndpointMap, resolveConnectionEndpoint, resolveHostPortSync } from '../../../common/utils/connection-endpoint';
import { AuditService } from '../../audit/audit.service';
import { TrafficService } from '../../traffic/traffic.service';

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
    private readonly auditService: AuditService,
    private readonly traffic: TrafficService,
  ) {}

  @Get()
  async list() {
    const users = await this.prisma.userProxy.findMany({ orderBy: { createdAt: 'desc' } });
    const active = this.engine.getActiveThreads();
    const poolMap = await buildPoolEndpointMap(this.prisma, users.map((u) => u.pool));
    return {
      status: 'success',
      data: users.map((u) => {
        const { host, port } = resolveHostPortSync(this.settings, u, u.pool ? poolMap.get(u.pool) : null);
        return {
          ...formatSubUser(u),
          port: u.port ?? null,
          domain: u.domain ?? null,
          effective_host: host,
          effective_port: port,
          active_threads: active.get(u.username) ?? 0,
        };
      }),
    };
  }

  /**
   * Variante paginée + recherche côté serveur, pour l'écran Sous-utilisateurs
   * (le `GET /subusers` ci-dessus renvoie tout — gardé tel quel pour la
   * recherche globale, le contrôle de port/domaine et le sélecteur admin, qui
   * ont besoin de la liste complète). Déclarée avant `:id` (route littérale).
   */
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, description: 'Filtre sur username/label (insensible à la casse)' })
  @ApiQuery({ name: 'tag', required: false })
  @Get('paginated')
  async listPaginated(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('search') search?: string,
    @Query('tag') tag?: string,
  ) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
    const where: any = {};
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (tag) where.tags = { contains: tag, mode: 'insensitive' };

    const [users, total] = await Promise.all([
      this.prisma.userProxy.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * l,
        take: l,
      }),
      this.prisma.userProxy.count({ where }),
    ]);
    const active = this.engine.getActiveThreads();
    const poolMap = await buildPoolEndpointMap(this.prisma, users.map((u) => u.pool));
    return {
      status: 'success',
      page: p,
      limit: l,
      total,
      data: users.map((u) => {
        const { host, port } = resolveHostPortSync(this.settings, u, u.pool ? poolMap.get(u.pool) : null);
        return {
          ...formatSubUser(u),
          port: u.port ?? null,
          domain: u.domain ?? null,
          effective_host: host,
          effective_port: port,
          active_threads: active.get(u.username) ?? 0,
        };
      }),
    };
  }

  /** Liste des tags distincts (tous comptes) — pour le filtre par tag sans charger la liste complète. */
  @Get('tags')
  async listTags() {
    const rows = await this.prisma.userProxy.findMany({
      where: { tags: { not: null } },
      select: { tags: true },
    });
    const set = new Set<string>();
    for (const r of rows) {
      for (const tagName of (r.tags ?? '').split(',')) {
        const trimmed = tagName.trim();
        if (trimmed) set.add(trimmed);
      }
    }
    return { status: 'success', data: Array.from(set).sort() };
  }

  @Post()
  async create(@Body() dto: PanelSubUserCreateDto, @CurrentUser() me: JwtUser) {
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
        domain: dto.domain ? normalizeDomain(dto.domain) || null : null,
        blockedDomains: dto.blocked_domains || null,
      },
    });
    if (dto.port != null) this.engine.invalidatePortCache();
    const created = await resolveConnectionEndpoint(this.prisma, this.settings, user);
    void this.auditService
      .log({ userId: me.id, userEmail: me.email, action: 'subuser.create', target: user.id, details: { username: user.username } })
      .catch(() => undefined);
    return {
      status: 'success',
      data: {
        ...formatSubUser(user),
        port: user.port ?? null,
        domain: user.domain ?? null,
        effective_host: created.host,
        effective_port: created.port,
      },
    };
  }

  /**
   * Création en masse (import CSV) : un objet PanelSubUserCreateDto par ligne.
   * Best-effort : une ligne en erreur (port pris, etc.) n'interrompt pas les
   * autres — le détail des échecs est renvoyé pour affichage panel.
   * Déclaré avant les routes `:id` (route littérale prioritaire).
   */
  @Post('bulk-import')
  async bulkImport(@Body() body: { items: PanelSubUserCreateDto[] }, @CurrentUser() me: JwtUser) {
    const items = body.items || [];
    if (!items.length) throw new BadRequestException('No items provided');
    if (items.length > 5000) throw new BadRequestException('Too many items (max 5000)');

    let created = 0;
    const errors: { line: number; username?: string; error: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      const dto = items[i];
      try {
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
            pool: dto.pool || null,
            port: dto.port ?? null,
            domain: dto.domain ? normalizeDomain(dto.domain) || null : null,
            blockedDomains: dto.blocked_domains || null,
          },
        });
        if (dto.port != null) this.engine.invalidatePortCache();
        created++;
      } catch (err: any) {
        errors.push({ line: i + 1, username: dto.username, error: err?.message?.slice(0, 200) || 'unknown error' });
      }
    }

    void this.auditService
      .log({ userId: me.id, userEmail: me.email, action: 'subuser.bulk-import', details: { created, errors: errors.length } })
      .catch(() => undefined);

    return { status: 'success', created, failed: errors.length, errors };
  }

  /**
   * Opérations en masse sur plusieurs comptes proxy.
   * Déclaré avant les routes `:id` (route littérale prioritaire).
   */
  @Post('bulk')
  async bulk(@Body() dto: BulkSubUsersDto, @CurrentUser() me: JwtUser) {
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
        // Écrit d'abord le trafic encore en mémoire : sinon ces octets
        // (consommés AVANT le reset) étaient ajoutés au compteur remis à zéro.
        await this.traffic.flushAll();
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
    void this.auditService
      .log({ userId: me.id, userEmail: me.email, action: `subuser.bulk.${dto.action}`, target: dto.ids.join(','), details: { count: dto.ids.length } })
      .catch(() => undefined);
    return { status: 'success', affected: dto.ids.length };
  }

  @ApiParam({ name: 'id', description: 'ID du sous-utilisateur proxy' })
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: PanelSubUserUpdatePortDto, @CurrentUser() me: JwtUser) {
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
    if (dto.domain !== undefined) data.domain = dto.domain ? normalizeDomain(dto.domain) || null : null;
    if (dto.blocked_domains !== undefined) data.blockedDomains = dto.blocked_domains || null;
    try {
      const user = await this.prisma.userProxy.update({ where: { id }, data });
      this.engine.invalidateUserCache(user.username);
      if (dto.port !== undefined) this.engine.invalidatePortCache();
      const resolved = await resolveConnectionEndpoint(this.prisma, this.settings, user);
      void this.auditService
        .log({ userId: me.id, userEmail: me.email, action: 'subuser.update', target: user.id, details: { changed: Object.keys(data) } })
        .catch(() => undefined);
      return {
        status: 'success',
        data: {
          ...formatSubUser(user),
          port: user.port ?? null,
          domain: user.domain ?? null,
          effective_host: resolved.host,
          effective_port: resolved.port,
        },
      };
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
      return { status: 'success', data: { ...formatSubUser(user), port: user.port ?? null, domain: user.domain ?? null } };
    } catch {
      throw new NotFoundException(t('errors.proxyNotFound'));
    }
  }

  /** Réinitialise les compteurs de trafic d'un compte (bytes + usedGb → 0). */
  @ApiParam({ name: 'id', description: 'ID du sous-utilisateur proxy' })
  @Post(':id/reset-traffic')
  async resetTraffic(@Param('id') id: string) {
    try {
      // Cf. bulk 'reset-traffic' : le trafic pré-reset en mémoire est écrit
      // avant la remise à zéro, pour ne pas être compté dans la nouvelle période.
      await this.traffic.flushAll();
      const user = await this.prisma.userProxy.update({
        where: { id },
        data: { totalBytesSent: 0n, totalBytesReceived: 0n, usedGb: 0 },
      });
      this.engine.invalidateUserCache(user.username);
      return { status: 'success', data: { ...formatSubUser(user), port: user.port ?? null, domain: user.domain ?? null } };
    } catch {
      throw new NotFoundException(t('errors.proxyNotFound'));
    }
  }

  @ApiParam({ name: 'id', description: 'ID du sous-utilisateur proxy' })
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() me: JwtUser) {
    try {
      const user = await this.prisma.userProxy.findUnique({ where: { id } });
      if (!user) throw new NotFoundException(t('errors.proxyNotFound'));
      await this.prisma.userProxy.delete({ where: { id } });
      this.engine.invalidateUserCache(user.username);
      if (user.port != null) this.engine.invalidatePortCache();
      void this.auditService
        .log({ userId: me.id, userEmail: me.email, action: 'subuser.delete', target: id, details: { username: user.username } })
        .catch(() => undefined);
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
    const { host, port } = await resolveConnectionEndpoint(this.prisma, this.settings, user);
    return {
      status: 'success',
      // 4 champs (host:port:user-session-XXXX:pass) — compatible avec tout
      // logiciel n'acceptant que le format classique host:port:user:pass.
      format: 'host:port:username-session-XXXX:password',
      count: c,
      proxies: buildStickyList(user, host, port, c),
      // Format rotatif (pas de session : chaque nouvelle connexion sur cette
      // même ligne peut tomber sur un upstream différent) — pratique pour les
      // clients qui ne gèrent pas le host:port:user:session:pass.
      rotating_format: 'username:password@host:port',
      rotating: `${user.username}:${user.password}@${host}:${port}`,
    };
  }

  /**
   * Statistiques d'usage d'un compte proxy pour l'admin : total envoyé/reçu,
   * nombre de requêtes, threads actifs, ET répartition par site (top
   * domaines) — jusqu'ici réservé au propriétaire du compte via
   * `me/proxies/:id/usage` ; les admins n'avaient aucune vue détaillée par
   * site depuis la page Sous-utilisateurs.
   */
  @ApiParam({ name: 'id', description: 'ID du sous-utilisateur proxy' })
  @ApiQuery({ name: 'period', required: false, enum: ['week', 'month', 'year', 'all'], description: 'Période de statistiques' })
  @Get(':id/usage')
  async usage(@Param('id') id: string, @Query('period') period: Period = 'week') {
    const user = await this.prisma.userProxy.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(t('errors.proxyNotFound'));
    const start = periodStart(period);
    const where = { userProxyId: id, date: { gte: start } };
    const [totals, topDomains, errorRows] = await Promise.all([
      this.prisma.proxyUsage.aggregate({
        where,
        _sum: { bytesSent: true, bytesReceived: true, requests: true },
      }),
      this.prisma.proxyUsage.groupBy({
        by: ['hostname'],
        where,
        _sum: { bytesSent: true, bytesReceived: true, requests: true },
        orderBy: { _sum: { requests: 'desc' } },
        take: 25,
      }),
      // Erreurs détectées sur le trafic HTTP en clair (403/captcha/geo-block) —
      // ne couvre pas l'HTTPS, le moteur ne voit jamais de code de statut à
      // travers un tunnel CONNECT chiffré (limite structurelle, pas un manque
      // de collecte).
      this.prisma.proxyUsageError.groupBy({
        by: ['reason'],
        where,
        _sum: { count: true },
      }),
    ]);
    const sent = totals._sum.bytesSent ?? 0;
    const received = totals._sum.bytesReceived ?? 0;
    const active = this.engine.getActiveThreads().get(user.username) ?? 0;
    const totalErrors = errorRows.reduce((a, e) => a + (e._sum.count ?? 0), 0);
    return {
      status: 'success',
      period,
      total_stats: {
        bytesSent: sent,
        bytesReceived: received,
        totalGb: Math.round(((sent + received) / 1024 ** 3) * 10000) / 10000,
        requests: totals._sum.requests ?? 0,
        active_threads: active,
        threads_limit: user.threadsLimit,
        errors: totalErrors,
      },
      top_domains: topDomains.map((d) => ({
        hostname: d.hostname,
        requests: d._sum.requests ?? 0,
        bytesSent: d._sum.bytesSent ?? 0,
        bytesReceived: d._sum.bytesReceived ?? 0,
      })),
      errors_by_reason: errorRows.map((e) => ({ reason: e.reason, count: e._sum.count ?? 0 })),
    };
  }

  /**
   * Historique de trafic JOUR PAR JOUR pour CE compte (Analytics → filtre par
   * sous-utilisateur). Granularité fixée par le modèle `ProxyUsage` (une ligne
   * par compte+hostname+jour) — pas d'intervalle plus fin possible sans
   * changer ce que le moteur persiste.
   */
  @ApiParam({ name: 'id', description: 'ID du sous-utilisateur proxy' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Nombre de jours (défaut 7)' })
  @Get(':id/traffic-history')
  async trafficHistory(@Param('id') id: string, @Query('days') days = '7') {
    const user = await this.prisma.userProxy.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new NotFoundException(t('errors.proxyNotFound'));
    const d = Math.max(1, Math.min(90, parseInt(days, 10) || 7));
    const since = new Date();
    since.setDate(since.getDate() - d);
    since.setHours(0, 0, 0, 0);

    const rows = await this.prisma.proxyUsage.groupBy({
      by: ['date'],
      where: { userProxyId: id, date: { gte: since } },
      _sum: { bytesSent: true, bytesReceived: true, requests: true },
      orderBy: { date: 'asc' },
    });
    return {
      status: 'success',
      data: rows.map((r) => ({
        date: r.date,
        bytesSent: r._sum.bytesSent ?? 0,
        bytesReceived: r._sum.bytesReceived ?? 0,
        requests: r._sum.requests ?? 0,
      })),
    };
  }

  /**
   * Liste les liens de partage (actifs et expirés/révoqués) d'un compte proxy,
   * pour affichage + révocation dans le panel.
   */
  @ApiParam({ name: 'id', description: 'ID du sous-utilisateur proxy' })
  @Get(':id/share-links')
  async listShareLinks(@Param('id') id: string) {
    const links = await this.prisma.shareLink.findMany({
      where: { userProxyId: id },
      orderBy: { createdAt: 'desc' },
    });
    return { status: 'success', data: links };
  }

  /**
   * Génère un lien de partage temporaire (accès public sans login) donnant les
   * identifiants de connexion complets de ce compte proxy. `expires_in_hours`
   * absent/null = pas d'expiration (révocation manuelle uniquement).
   */
  @ApiParam({ name: 'id', description: 'ID du sous-utilisateur proxy' })
  @Post(':id/share-links')
  async createShareLink(
    @Param('id') id: string,
    @Body() body: { expires_in_hours?: number | null },
    @CurrentUser() me: JwtUser,
  ) {
    const user = await this.prisma.userProxy.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(t('errors.proxyNotFound'));

    const link = await this.prisma.shareLink.create({
      data: {
        token: randomString(40),
        userProxyId: id,
        createdById: me.id,
        expiresAt:
          body.expires_in_hours != null && body.expires_in_hours > 0
            ? new Date(Date.now() + body.expires_in_hours * 3600_000)
            : null,
      },
    });
    void this.auditService
      .log({ userId: me.id, userEmail: me.email, action: 'subuser.share-link.create', target: id, details: { expiresAt: link.expiresAt } })
      .catch(() => undefined);
    return { status: 'success', data: link };
  }

  /** Révoque un lien de partage (le rend immédiatement inutilisable). */
  @ApiParam({ name: 'linkId', description: 'ID du lien de partage' })
  @Post('share-links/:linkId/revoke')
  async revokeShareLink(@Param('linkId') linkId: string, @CurrentUser() me: JwtUser) {
    await this.prisma.shareLink.update({ where: { id: linkId }, data: { revoked: true } }).catch(() => undefined);
    void this.auditService
      .log({ userId: me.id, userEmail: me.email, action: 'subuser.share-link.revoke', target: linkId })
      .catch(() => undefined);
    return { status: 'success' };
  }
}
