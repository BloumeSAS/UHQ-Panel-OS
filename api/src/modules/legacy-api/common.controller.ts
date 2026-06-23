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
import { StickySettingsDto } from './dto';

@ApiTags('legacy-common')
@ApiSecurity('x-api-key')
@ApiBasicAuth()
@Controller('api/v1/common')
@UseGuards(ApiKeyGuard)
export class CommonController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ProxyServerService,
  ) {}

  @Get('pool_stats')
  @Scopes('read:pool')
  async poolStats() {
    const all = await this.prisma.backendProxy.findMany();
    const working = await this.prisma.backendProxy.count({ where: { isWorking: true } });
    const total = all.length;
    const byProvider: Record<string, number> = {};
    const byProto: Record<string, number> = {};
    for (const p of all) {
      const name = p.provider || 'Unknown';
      byProvider[name] = (byProvider[name] ?? 0) + 1;
      byProto[p.protocol] = (byProto[p.protocol] ?? 0) + 1;
    }
    return {
      status: 'success',
      data: {
        total_proxies: total,
        working_proxies: working,
        dead_proxies: total - working,
        by_provider: byProvider,
        by_protocol: byProto,
      },
    };
  }

  @Get('available_count')
  @Scopes('read:pool')
  async availableCount() {
    const count = await this.prisma.backendProxy.count({ where: { isWorking: true } });
    return { status: 'success', count };
  }

  @ApiQuery({ name: 'country', required: false, description: 'Code pays à 2 lettres (ex. FR)' })
  @ApiQuery({ name: 'protocol', required: false, enum: ['http', 'socks4', 'socks5'], description: 'Protocole' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre maximum de proxies à retourner' })
  @Get('proxies')
  @Scopes('read:pool')
  async proxies(
    @Query('country') country?: string,
    @Query('protocol') protocol?: string,
    @Query('limit') limit: string = '100',
  ) {
    const lim = Math.max(1, Math.min(500, parseInt(limit, 10) || 100));
    const where: any = { isWorking: true };
    if (country) where.country = country.toUpperCase();
    if (protocol) where.protocol = protocol.toLowerCase();
    const proxies = await this.prisma.backendProxy.findMany({
      where,
      take: lim,
      orderBy: { lastChecked: 'desc' },
    });
    const usageMap = this.engine.getSessionUsageMap();
    return {
      status: 'success',
      count: proxies.length,
      data: proxies.map((p) => ({
        ip: p.ip,
        port: p.port,
        protocol: p.protocol,
        country: p.country,
        provider: p.provider,
        url: `${p.protocol}://${p.ip}:${p.port}`,
        sticky_sessions: usageMap[p.id] ?? 0,
        latency_ms: p.averageLatency ? Math.round(p.averageLatency) : null,
      })),
    };
  }

  @Get('sticky-sessions')
  @Scopes('read:proxies')
  async stickySessions() {
    const now = Date.now();
    const out: any[] = [];
    for (const [key, val] of this.engine.getSessions()) {
      const idx = key.indexOf(':');
      const username = idx >= 0 ? key.substring(0, idx) : key;
      const sessionId = idx >= 0 ? key.substring(idx + 1) : '';
      out.push({
        username,
        session_id: sessionId,
        proxy_id: val.proxyId,
        remaining_seconds: Math.max(0, Math.round((val.expiresAt - now) / 100) / 10),
      });
    }
    return { status: 'success', count: out.length, data: out };
  }

  @Post('sticky-settings')
  @Scopes('write:proxies')
  stickySettings(@Body() _dto: StickySettingsDto) {
    // Deprecated path kept for compatibility — user-level TTL takes precedence.
    return {
      status: 'success',
      message: 'Global TTL set, but sub-user settings take precedence.',
    };
  }

  @Get('countries')
  @Scopes('read:pool')
  async countries() {
    const proxies = await this.prisma.backendProxy.findMany({
      where: { isWorking: true },
      select: { country: true },
    });
    const count: Record<string, number> = {};
    for (const p of proxies) {
      if (p.country) count[p.country] = (count[p.country] ?? 0) + 1;
    }
    const sorted = Object.fromEntries(
      Object.entries(count).sort(([, a], [, b]) => b - a),
    );
    return { status: 'success', data: sorted };
  }

  /**
   * Nombre de pays et d'IPs disponibles dans une catégorie (pool). Sans
   * `pool`, porte sur l'ensemble du pool partagé (toutes catégories).
   */
  @ApiQuery({ name: 'pool', required: false, description: 'Nom de la catégorie/pool (vide = tout le pool)' })
  @Get('category-stats')
  @Scopes('read:pool')
  async categoryStats(@Query('pool') pool?: string) {
    if (pool) {
      const poolRow = await this.prisma.proxyPool.findUnique({ where: { name: pool } });
      if (poolRow?.alwaysOnline && poolRow.fakeCountries && poolRow.fakeIpCount) {
        return this.fakeCategoryStats(pool, poolRow.fakeCountries, poolRow.fakeIpCount);
      }
    }
    const where: any = { isWorking: true };
    if (pool) where.pool = pool;
    const proxies = await this.prisma.backendProxy.findMany({
      where,
      select: { country: true, ip: true },
    });
    const byCountry: Record<string, number> = {};
    const ips = new Set<string>();
    for (const p of proxies) {
      ips.add(p.ip);
      if (p.country && p.country !== 'Unknown') {
        const code = p.country.trim().toUpperCase();
        byCountry[code] = (byCountry[code] ?? 0) + 1;
      }
    }
    const sortedByCountry = Object.fromEntries(
      Object.entries(byCountry).sort(([, a], [, b]) => b - a),
    );
    return {
      status: 'success',
      pool: pool || null,
      data: {
        countries_count: Object.keys(sortedByCountry).length,
        ip_count: ips.size,
        proxy_count: proxies.length,
        by_country: sortedByCountry,
      },
    };
  }

  /**
   * Stats simulées pour une pool "Toujours en ligne" (cf. ProxyPool.alwaysOnline) :
   * répartit `fakeIpCount` sur les pays déclarés (`fakeCountries`) de façon
   * déterministe (même pool+pays ⇒ même répartition à chaque appel, pas de
   * tirage aléatoire par requête) mais visuellement non-uniforme.
   */
  private fakeCategoryStats(pool: string, fakeCountries: string, fakeIpCount: number) {
    const countries = fakeCountries
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    const byCountry = distributeFakeCount(fakeIpCount, countries, pool);
    return {
      status: 'success',
      pool,
      data: {
        countries_count: countries.length,
        ip_count: fakeIpCount,
        proxy_count: fakeIpCount,
        by_country: byCountry,
      },
    };
  }
}

/** Hash simple et stable (FNV-like) — pas de Math.random() : reproductible entre appels. */
function stableWeight(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (h % 1000) + 100;
}

function distributeFakeCount(total: number, countries: string[], poolName: string): Record<string, number> {
  if (countries.length === 0 || total <= 0) return {};
  const weights = countries.map((c) => stableWeight(`${poolName}:${c}`));
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  const counts = countries.map((c, i) => Math.round((weights[i] / sumWeights) * total));
  // Corrige la dérive d'arrondi sur la plus grosse entrée pour que la somme
  // reste exactement égale à `total`.
  const diff = total - counts.reduce((a, b) => a + b, 0);
  const maxIdx = counts.indexOf(Math.max(...counts));
  counts[maxIdx] += diff;
  const byCountry: Record<string, number> = {};
  countries.forEach((c, i) => { byCountry[c] = counts[i]; });
  return Object.fromEntries(Object.entries(byCountry).sort(([, a], [, b]) => b - a));
}
