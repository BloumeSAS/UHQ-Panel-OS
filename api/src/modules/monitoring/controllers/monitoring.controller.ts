import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { ProxyServerService } from '../../proxy-engine/proxy-server.service';
import { parseProxyList, parseProxyLine } from '../../../common/utils/proxy-parse';
import { ImportProxiesDto } from '../../../common/dto/panel.dto';
import { PoolHealthSnapshotService } from '../pool-health-snapshot.service';

@ApiTags('panel-monitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api/panel/monitoring')
export class PanelMonitoringController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ProxyServerService,
    private readonly poolHealth: PoolHealthSnapshotService,
  ) {}

  /** Historique de la santé du pool (time series). */
  @ApiQuery({ name: 'hours', required: false, type: Number, description: 'Nombre d\'heures (défaut: 24)' })
  @Get('pool-health-history')
  async poolHealthHistory(@Query('hours') hours = '24') {
    const data = await this.poolHealth.getHistory(parseInt(hours, 10) || 24);
    return { status: 'success', data };
  }

  /**
   * Snapshot temps réel : threads/sessions, état du pool, conso du jour.
   * Agrégé côté DB (`aggregate`/`groupBy`) plutôt que de charger toutes les
   * lignes `ProxyUsage` du jour en mémoire — appelé fréquemment (dashboard),
   * c'était la requête la plus coûteuse de ce contrôleur sur un pool actif.
   */
  @Get('live')
  async live() {
    const threads = Array.from(this.engine.getActiveThreads().values()).reduce(
      (a, b) => a + b,
      0,
    );
    const sessions = this.engine.getSessions().size;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [total, working, banned, totals, topGroups] = await Promise.all([
      this.prisma.backendProxy.count(),
      this.prisma.backendProxy.count({ where: { isWorking: true, isBlacklisted: false } }),
      this.prisma.backendProxy.count({ where: { isBlacklisted: true } }),
      this.prisma.proxyUsage.aggregate({
        where: { date: { gte: today } },
        _sum: { bytesSent: true, bytesReceived: true, requests: true },
      }),
      this.prisma.proxyUsage.groupBy({
        by: ['hostname'],
        where: { date: { gte: today } },
        _sum: { requests: true },
        orderBy: { _sum: { requests: 'desc' } },
        take: 10,
      }),
    ]);
    const totalGb = ((totals._sum.bytesSent ?? 0) + (totals._sum.bytesReceived ?? 0)) / 1024 ** 3;
    const top = topGroups.map((g) => ({ hostname: g.hostname, requests: g._sum.requests ?? 0 }));

    return {
      status: 'success',
      live: {
        active_threads: threads,
        active_sessions: sessions,
        pool: { total, working, banned },
      },
      today_summary: {
        total_gb: Math.round(totalGb * 10000) / 10000,
        total_requests: totals._sum.requests ?? 0,
        top_domains: top,
      },
    };
  }

  /** Répartition du pool par provider / protocole — agrégé côté DB (`groupBy`). */
  @Get('pool')
  async pool() {
    const [total, working, byProviderRaw, byProtocolRaw] = await Promise.all([
      this.prisma.backendProxy.count(),
      this.prisma.backendProxy.count({ where: { isWorking: true } }),
      this.prisma.backendProxy.groupBy({ by: ['provider'], _count: { _all: true } }),
      this.prisma.backendProxy.groupBy({ by: ['protocol'], _count: { _all: true } }),
    ]);
    const byProvider: Record<string, number> = {};
    for (const g of byProviderRaw) byProvider[g.provider || 'Unknown'] = (byProvider[g.provider || 'Unknown'] ?? 0) + g._count._all;
    const byProtocol: Record<string, number> = {};
    for (const g of byProtocolRaw) byProtocol[g.protocol] = (byProtocol[g.protocol] ?? 0) + g._count._all;
    return {
      status: 'success',
      data: {
        total_proxies: total,
        working_proxies: working,
        dead_proxies: total - working,
        by_provider: byProvider,
        by_protocol: byProtocol,
      },
    };
  }

  /** Liste filtrable de proxies du pool (pays / protocole / état / pool / page). */
  @ApiQuery({ name: 'country', required: false, description: 'Code pays à 2 lettres (ex. FR)' })
  @ApiQuery({ name: 'protocol', required: false, enum: ['http', 'socks4', 'socks5'] })
  @ApiQuery({ name: 'working', required: false, type: Boolean })
  @ApiQuery({ name: 'pool', required: false, description: 'Nom de la pool (catégorie)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Proxies par page (défaut 100, max 1000)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page 0-based' })
  @Get('proxies')
  async proxies(
    @Query('country') country?: string,
    @Query('protocol') protocol?: string,
    @Query('working') working?: string,
    @Query('pool') pool?: string,
    @Query('limit') limit = '100',
    @Query('page') page = '0',
  ) {
    const lim = Math.max(1, Math.min(1000, parseInt(limit, 10) || 100));
    const pg = Math.max(0, parseInt(page, 10) || 0);
    const where: any = {};
    if (country) where.country = country.toUpperCase();
    if (protocol) where.protocol = protocol.toLowerCase();
    if (working === 'true') where.isWorking = true;
    if (working === 'false') where.isWorking = false;
    if (pool) where.pool = pool;
    const [total, proxies] = await Promise.all([
      this.prisma.backendProxy.count({ where }),
      this.prisma.backendProxy.findMany({
        where,
        take: lim,
        skip: pg * lim,
        orderBy: { lastChecked: 'desc' },
      }),
    ]);
    return {
      status: 'success',
      total,
      pages: Math.ceil(total / lim),
      page: pg,
      count: proxies.length,
      data: proxies.map((p) => ({
        id: p.id,
        ip: p.ip,
        port: p.port,
        protocol: p.protocol,
        country: p.country,
        provider: p.provider,
        is_working: p.isWorking,
        is_blacklisted: p.isBlacklisted,
        fail_count: p.failCount,
        latency: p.averageLatency,
        url: p.url,
        pool: p.pool,
      })),
    };
  }

  /**
   * Exporte les proxies du pool sous forme de texte (un par ligne).
   * format=standard → `ip:port[:user:pass]` ; format=url → `proto://[user:pass@]ip:port`.
   * Respecte les filtres pays / protocole / état (working=true exclut les blacklistés).
   * Déclaré avant `proxies/:id/...` (route littérale).
   */
  @ApiQuery({ name: 'format', required: false, enum: ['standard', 'url'] })
  @ApiQuery({ name: 'country', required: false, description: 'Code pays à 2 lettres (ex. FR)' })
  @ApiQuery({ name: 'protocol', required: false, enum: ['http', 'socks4', 'socks5'] })
  @ApiQuery({ name: 'working', required: false, type: Boolean })
  @Get('proxies/export')
  async exportProxies(
    @Query('format') format = 'standard',
    @Query('country') country?: string,
    @Query('protocol') protocol?: string,
    @Query('working') working?: string,
  ) {
    const where: any = {};
    if (country) where.country = country.toUpperCase();
    if (protocol) where.protocol = protocol.toLowerCase();
    if (working === 'true') {
      where.isWorking = true;
      where.isBlacklisted = false;
    }
    if (working === 'false') where.isWorking = false;
    const rows = await this.prisma.backendProxy.findMany({
      where,
      select: { url: true, ip: true, port: true },
      orderBy: { lastChecked: 'desc' },
    });
    const lines = rows.map((p) => {
      if (format === 'url') return p.url;
      const auth = parseProxyLine(p.url)?.auth;
      return auth ? `${p.ip}:${p.port}:${auth}` : `${p.ip}:${p.port}`;
    });
    return { status: 'success', count: lines.length, text: lines.join('\n') };
  }

  /**
   * Import MANUEL de proxies dans le pool (sans scraper). Une ligne par proxy
   * (`[proto://]ip:port`). Provider « Manual ». Validés ensuite par le checker.
   */
  @Post('proxies/import')
  async importProxies(@Body() body: ImportProxiesDto) {
    const parsed = parseProxyList(body?.text ?? '');
    if (parsed.length === 0) {
      return { status: 'success', imported: 0, message: 'Aucun proxy valide détecté' };
    }
    const forceProto = body?.protocol?.toLowerCase();
    let imported = 0;
    const CHUNK = 500;
    for (let i = 0; i < parsed.length; i += CHUNK) {
      const slice = parsed.slice(i, i + CHUNK);
      const res = await this.prisma.backendProxy.createMany({
        skipDuplicates: true,
        data: slice.map((p) => {
          const protocol = forceProto || p.protocol;
          return {
            id: randomUUID(),
            url: p.auth ? `${protocol}://${p.auth}@${p.ip}:${p.port}` : `${protocol}://${p.ip}:${p.port}`,
            protocol,
            ip: p.ip,
            port: p.port,
            provider: 'Manual',
            isWorking: true,
            pool: body.pool || null,
          };
        }),
      });
      imported += res.count;
    }
    return { status: 'success', imported, message: `${imported} proxies importés` };
  }

  /** Réinitialise un proxy mort : failCount → 0, isWorking → true. */
  @ApiParam({ name: 'id', description: 'ID du proxy dans le pool' })
  @Patch('proxies/:id/revive')
  async reviveProxy(@Param('id') id: string) {
    await this.prisma.backendProxy.update({
      where: { id },
      data: { isWorking: true, failCount: 0 },
    }).catch(() => undefined);
    return { status: 'success' };
  }

  /** Réinitialise en masse tous les proxies morts (failCount → 0, isWorking → true). */
  @Post('proxies/revive-dead')
  async reviveDeadProxies() {
    const res = await this.prisma.backendProxy.updateMany({
      where: { isWorking: false, isBlacklisted: false },
      data: { isWorking: true, failCount: 0 },
    });
    return { status: 'success', revived: res.count };
  }

  /**
   * Blackliste / déblackliste un proxy. Blacklister le marque aussi hors-ligne ;
   * déblacklister le réactive (isWorking → true, failCount → 0).
   */
  @ApiParam({ name: 'id', description: 'ID du proxy dans le pool' })
  @Patch('proxies/:id/blacklist')
  async blacklistProxy(@Param('id') id: string, @Body() body: { blacklisted?: boolean }) {
    const blacklisted = body?.blacklisted === true;
    await this.prisma.backendProxy
      .update({
        where: { id },
        data: blacklisted
          ? { isBlacklisted: true, isWorking: false }
          : { isBlacklisted: false, isWorking: true, failCount: 0 },
      })
      .catch(() => undefined);
    return { status: 'success' };
  }

  /** Supprime un proxy du pool. */
  @ApiParam({ name: 'id', description: 'ID du proxy dans le pool' })
  @Delete('proxies/:id')
  async deleteProxy(@Param('id') id: string) {
    await this.prisma.backendProxy.delete({ where: { id } }).catch(() => undefined);
    return { status: 'success' };
  }

  /**
   * Supprime des proxies en masse (ex. tous les HS).
   * Les KO définitifs (isBlacklisted=true) ne sont JAMAIS supprimés en masse,
   * quel que soit le filtre `working` — seule la suppression individuelle
   * (DELETE /proxies/:id) le permet, en connaissance de cause.
   */
  @ApiQuery({ name: 'working', required: false, type: String, description: 'false pour supprimer uniquement les proxies HS' })
  @Delete('proxies')
  async deleteManyProxies(@Query('working') working?: string) {
    const where: any = { isBlacklisted: false };
    if (working === 'false') where.isWorking = false;
    const res = await this.prisma.backendProxy.deleteMany({ where });
    return { status: 'success', deleted: res.count };
  }

  /**
   * Répartition des proxies working par pays (codes ISO 2 lettres). Filtrable
   * par pool. Agrégé côté DB (`groupBy`) plutôt que de charger tout le pool.
   */
  @ApiQuery({ name: 'pool', required: false, description: 'Filtrer par pool (catégorie)' })
  @Get('countries')
  async countries(@Query('pool') pool?: string) {
    const where: any = { isWorking: true };
    if (pool) where.pool = pool;
    const groups = await this.prisma.backendProxy.groupBy({
      by: ['country'],
      where,
      _count: { _all: true },
    });
    const count: Record<string, number> = {};
    for (const g of groups) {
      if (!g.country || g.country === 'Unknown') continue;
      // Garder uniquement les codes ISO 2 lettres
      const code = g.country.trim().toUpperCase();
      if (code.length === 2) count[code] = (count[code] ?? 0) + g._count._all;
    }
    const sorted = Object.fromEntries(Object.entries(count).sort(([, a], [, b]) => b - a));
    return { status: 'success', data: sorted };
  }

  /**
   * Rapport de statistiques global : trafic, proxies, utilisateurs, scraper.
   * period : 'day' | 'week' | 'month' | 'year' | 'all'
   */
  @ApiQuery({ name: 'period', required: false, enum: ['day', 'week', 'month', 'year', 'all'], description: 'Période du rapport de statistiques' })
  @Get('reports')
  async reports(@Query('period') period = 'week') {
    const since = this.periodStart(period);
    const dateFilter = since ? { date: { gte: since } } : undefined;

    // ── Trafic global + top domaines + par compte — agrégés côté DB ─────────
    // (`groupBy`/`aggregate` au lieu de charger toutes les lignes ProxyUsage
    // de la période en mémoire pour les sommer en JS). Seul le graphique
    // quotidien a encore besoin des lignes brutes (bucketing par jour, pas de
    // truncation de date dans `groupBy` Prisma) — champs réduits au minimum.
    const [totals, domainGroups, userGroups, dailyRows] = await Promise.all([
      this.prisma.proxyUsage.aggregate({
        where: dateFilter,
        _sum: { bytesSent: true, bytesReceived: true, requests: true },
      }),
      this.prisma.proxyUsage.groupBy({
        by: ['hostname'],
        where: dateFilter,
        _sum: { requests: true },
        orderBy: { _sum: { requests: 'desc' } },
        take: 20,
      }),
      this.prisma.proxyUsage.groupBy({
        by: ['userProxyId'],
        where: dateFilter,
        _sum: { bytesSent: true, bytesReceived: true, requests: true },
      }),
      this.prisma.proxyUsage.findMany({
        where: dateFilter,
        select: { date: true, bytesSent: true, bytesReceived: true, requests: true },
      }),
    ]);
    const totalGb = ((totals._sum.bytesSent ?? 0) + (totals._sum.bytesReceived ?? 0)) / 1024 ** 3;
    const totalRequests = totals._sum.requests ?? 0;
    const topDomains = domainGroups.map((g) => ({ hostname: g.hostname, requests: g._sum.requests ?? 0 }));
    const userTrafficMap: Record<string, { sent: number; received: number; requests: number }> = {};
    for (const g of userGroups) {
      userTrafficMap[g.userProxyId] = {
        sent: g._sum.bytesSent ?? 0,
        received: g._sum.bytesReceived ?? 0,
        requests: g._sum.requests ?? 0,
      };
    }

    // ── Trafic par jour (graphique) ─────────────────────────────────────────
    const dailyMap: Record<string, { gb: number; requests: number }> = {};
    for (const r of dailyRows) {
      const day = r.date.toISOString().slice(0, 10);
      if (!dailyMap[day]) dailyMap[day] = { gb: 0, requests: 0 };
      dailyMap[day].gb += (r.bytesSent + r.bytesReceived) / 1024 ** 3;
      dailyMap[day].requests += r.requests;
    }
    const dailyTraffic = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, gb: Math.round(v.gb * 10000) / 10000, requests: v.requests }));

    // ── Stats par compte proxy ──────────────────────────────────────────────
    const subUsers = await this.prisma.userProxy.findMany({
      select: { id: true, name: true, username: true, usedGb: true, totalGb: true, isBlocked: true },
    });
    const userStats = subUsers.map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      used_gb: Math.round(((userTrafficMap[u.id]?.sent ?? 0) + (userTrafficMap[u.id]?.received ?? 0)) / 1024 ** 3 * 10000) / 10000,
      total_requests: userTrafficMap[u.id]?.requests ?? 0,
      limit_gb: u.totalGb,
      is_blocked: u.isBlocked,
    })).sort((a, b) => b.used_gb - a.used_gb);

    // ── Stats pool de proxies — agrégées côté DB (`groupBy`) ────────────────
    const [totalPool, workingPool, bannedPool, topProxies, byProviderRaw] = await Promise.all([
      this.prisma.backendProxy.count(),
      this.prisma.backendProxy.count({ where: { isWorking: true, isBlacklisted: false } }),
      this.prisma.backendProxy.count({ where: { isBlacklisted: true } }),
      this.prisma.backendProxy.findMany({
        orderBy: { successCount: 'desc' },
        take: 20,
        select: { ip: true, port: true, protocol: true, country: true, provider: true, successCount: true, failureCount: true, averageLatency: true, isWorking: true },
      }),
      this.prisma.backendProxy.groupBy({ by: ['provider'], _count: { _all: true } }),
    ]);
    const byProvider: Record<string, { total: number; working: number }> = {};
    for (const g of byProviderRaw) {
      const k = g.provider || 'Unknown';
      byProvider[k] = { total: g._count._all, working: 0 };
    }
    // `working` par provider nécessite un 2nd groupBy filtré (Prisma ne permet
    // pas un _count conditionnel dans le même groupBy).
    const workingByProviderRaw = await this.prisma.backendProxy.groupBy({
      by: ['provider'],
      where: { isWorking: true },
      _count: { _all: true },
    });
    for (const g of workingByProviderRaw) {
      const k = g.provider || 'Unknown';
      if (byProvider[k]) byProvider[k].working = g._count._all;
    }

    // ── Stats utilisateurs panel ────────────────────────────────────────────
    const [totalPanelUsers, activeUsers] = await Promise.all([
      this.prisma.panelUser.count(),
      this.prisma.panelUser.count({ where: { isActive: true } }),
    ]);

    // ── Stats scraper ────────────────────────────────────────────────────────
    const scraperSources = await this.prisma.scraperSource.findMany({
      select: { id: true, name: true, url: true, enabled: true, protocol: true },
    });

    return {
      status: 'success',
      period,
      traffic: {
        total_gb: Math.round(totalGb * 10000) / 10000,
        total_requests: totalRequests,
        top_domains: topDomains,
        daily: dailyTraffic,
      },
      users: {
        panel_total: totalPanelUsers,
        panel_active: activeUsers,
        proxy_accounts: userStats,
      },
      pool: {
        total: totalPool,
        working: workingPool,
        banned: bannedPool,
        health_rate: totalPool ? Math.round((workingPool / totalPool) * 1000) / 10 : 0,
        top_proxies: topProxies.map((p) => ({
          proxy: `${p.ip}:${p.port}`,
          protocol: p.protocol,
          country: p.country,
          provider: p.provider,
          success: p.successCount,
          failure: p.failureCount,
          latency_ms: p.averageLatency ? Math.round(p.averageLatency) : null,
          is_working: p.isWorking,
          success_rate: p.successCount + p.failureCount > 0
            ? Math.round((p.successCount / (p.successCount + p.failureCount)) * 1000) / 10
            : null,
        })),
        by_provider: byProvider,
      },
      scraper: {
        sources_total: scraperSources.length,
        sources_enabled: scraperSources.filter((s) => s.enabled).length,
        sources: scraperSources,
      },
    };
  }

  private periodStart(period: string): Date | null {
    const now = new Date();
    switch (period) {
      case 'day': return new Date(now.getTime() - 86_400_000);
      case 'week': return new Date(now.getTime() - 7 * 86_400_000);
      case 'month': return new Date(now.getTime() - 30 * 86_400_000);
      case 'year': return new Date(now.getTime() - 365 * 86_400_000);
      default: return null;
    }
  }

  /** Export CSV des sous-utilisateurs proxy (nom, username, trafic). */
  @Get('subusers/export.csv')
  async exportSubusersCsv() {
    const list = await this.prisma.userProxy.findMany({ orderBy: { createdAt: 'desc' } });
    const rows = list.map((p: any) =>
      [p.id, p.username, p.name, p.usedGb ?? 0, p.totalGb ?? 0, p.isBlocked ? 'blocked' : 'active'].join(',')
    );
    const csv = ['id,username,name,used_gb,total_gb,status', ...rows].join('\n');
    return { status: 'success', csv };
  }
}
