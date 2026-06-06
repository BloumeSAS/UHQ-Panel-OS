import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBasicAuth, ApiParam, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { Scopes } from '../../common/decorators/scopes.decorator';
import { PrismaService } from '../../database/prisma.service';
import { ProxyServerService } from '../proxy-engine/proxy-server.service';

type Period = 'week' | 'month' | 'year' | 'all';

function periodStart(period: Period): Date {
  const now = new Date();
  switch (period) {
    case 'week':
      return new Date(now.getTime() - 7 * 86400_000);
    case 'month':
      return new Date(now.getTime() - 30 * 86400_000);
    case 'year':
      return new Date(now.getTime() - 365 * 86400_000);
    default:
      return new Date(2000, 0, 1);
  }
}

@ApiTags('legacy-stats')
@ApiSecurity('x-api-key')
@ApiBasicAuth()
@Controller('api/v1/stats')
@UseGuards(ApiKeyGuard)
export class StatsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ProxyServerService,
  ) {}

  @ApiParam({ name: 'proxy_id', description: 'ID du sous-utilisateur proxy' })
  @ApiQuery({ name: 'period', required: false, enum: ['week', 'month', 'year', 'all'], description: 'Période de statistiques' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre maximum d\'éléments par page' })
  @Get('proxy/:proxy_id')
  @Scopes('read:stats')
  async proxyStats(
    @Param('proxy_id') proxyId: string,
    @Query('period') period: Period = 'week',
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const startDate = periodStart(period);
    const skip = (pg - 1) * lim;

    const records = await this.prisma.proxyUsage.findMany({
      where: { userProxyId: proxyId, date: { gte: startDate } },
      orderBy: { date: 'desc' },
      take: lim,
      skip,
    });
    const all = await this.prisma.proxyUsage.findMany({
      where: { userProxyId: proxyId, date: { gte: startDate } },
    });
    const totalSent = all.reduce((a, r) => a + r.bytesSent, 0);
    const totalReceived = all.reduce((a, r) => a + r.bytesReceived, 0);
    const totalReqs = all.reduce((a, r) => a + r.requests, 0);

    return {
      status: 'success',
      proxy_id: proxyId,
      period,
      total_stats: {
        bytesSent: totalSent,
        bytesReceived: totalReceived,
        totalBytes: totalSent + totalReceived,
        totalGb: Math.round(((totalSent + totalReceived) / 1024 ** 3) * 10000) / 10000,
        requests: totalReqs,
      },
      usage: records.map((r) => ({
        hostname: r.hostname,
        bytesSent: r.bytesSent,
        bytesReceived: r.bytesReceived,
        requests: r.requests,
        date: r.date,
      })),
    };
  }

  @ApiQuery({ name: 'period', required: false, enum: ['week', 'month', 'year', 'all'], description: 'Période de statistiques' })
  @Get('global')
  @Scopes('read:stats')
  async global(@Query('period') period: Period = 'week') {
    const startDate = periodStart(period);
    const records = await this.prisma.proxyUsage.findMany({
      where: { date: { gte: startDate } },
    });
    const agg: Record<string, { bytes: number; requests: number }> = {};
    for (const r of records) {
      if (!agg[r.hostname]) agg[r.hostname] = { bytes: 0, requests: 0 };
      agg[r.hostname].bytes += r.bytesSent + r.bytesReceived;
      agg[r.hostname].requests += r.requests;
    }
    const sorted = Object.entries(agg).sort(([, a], [, b]) => b.bytes - a.bytes);
    return {
      status: 'success',
      period,
      top_hosts: sorted.slice(0, 25).map(([hostname, d]) => ({
        hostname,
        gb: Math.round((d.bytes / 1024 ** 3) * 10000) / 10000,
        requests: d.requests,
      })),
    };
  }

  @Get('live')
  @Scopes('read:stats')
  async live() {
    const threads = Array.from(this.engine.getActiveThreads().values()).reduce(
      (a, b) => a + b,
      0,
    );
    const sessions = this.engine.getSessions().size;
    const total = await this.prisma.backendProxy.count();
    const working = await this.prisma.backendProxy.count({
      where: { isWorking: true, isBlacklisted: false },
    });
    const banned = await this.prisma.backendProxy.count({ where: { isBlacklisted: true } });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const records = await this.prisma.proxyUsage.findMany({ where: { date: { gte: today } } });
    const agg: Record<string, number> = {};
    let totalGb = 0;
    let totalReqs = 0;
    for (const r of records) {
      agg[r.hostname] = (agg[r.hostname] ?? 0) + r.requests;
      totalGb += (r.bytesSent + r.bytesReceived) / 1024 ** 3;
      totalReqs += r.requests;
    }
    const sorted = Object.entries(agg).sort(([, a], [, b]) => b - a);
    return {
      status: 'success',
      timestamp: new Date(),
      live: {
        active_threads: threads,
        active_sessions: sessions,
        pool: { total, working, banned },
      },
      today_summary: {
        total_gb: Math.round(totalGb * 10000) / 10000,
        total_requests: totalReqs,
        top_domains: sorted.slice(0, 10).map(([hostname, requests]) => ({ hostname, requests })),
      },
    };
  }
}
