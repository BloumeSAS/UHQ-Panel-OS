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
   *
   * Une pool peut déclarer des pays simulés (`fakeCountries`) ; CHAQUE pays
   * de la liste a son propre nombre d'IP simulé (`fakeIpCountByCountry`,
   * tiré indépendamment dans `fakeIpCountMin..Max`), INDÉPENDAMMENT de
   * `alwaysOnline`. Ces chiffres s'AJOUTENT aux vraies stats (jamais un
   * remplacement) : une pool avec 0 vrai proxy affiche donc uniquement les
   * chiffres simulés, une pool avec du vrai stock affiche du réel + simulé
   * combiné.
   */
  @ApiQuery({ name: 'pool', required: false, description: 'Nom de la catégorie/pool (vide = tout le pool)' })
  @Get('category-stats')
  @Scopes('read:pool')
  async categoryStats(@Query('pool') poolRaw?: string) {
    const pool = poolRaw?.trim() || undefined;
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
    let ipCount = ips.size;
    let proxyCount = proxies.length;

    if (pool) {
      // findUnique exigerait une égalité octet pour octet : un espace
      // insécable ou une double-espace collés par erreur dans le nom suffit
      // à rater silencieusement la pool (vu en prod). On matche donc sur le
      // nom normalisé (Unicode NFC + espaces internes réduits) plutôt que
      // sur la chaîne brute.
      const pools = await this.prisma.proxyPool.findMany();
      const target = normalizePoolName(pool);
      const poolRow = pools.find((p) => normalizePoolName(p.name) === target);
      const fakeByCountry = (poolRow?.fakeIpCountByCountry as Record<string, number> | null) ?? {};
      for (const [code, n] of Object.entries(fakeByCountry)) {
        if (!n) continue;
        byCountry[code] = (byCountry[code] ?? 0) + n;
        ipCount += n;
        proxyCount += n;
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
        ip_count: ipCount,
        proxy_count: proxyCount,
        by_country: sortedByCountry,
      },
    };
  }
}

/** Unicode NFC + espaces (y compris insécables) réduits — tolère les artefacts de copier-coller dans le nom d'une pool. */
function normalizePoolName(name: string): string {
  return name.normalize('NFC').replace(/\s+/g, ' ').trim();
}

