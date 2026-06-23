import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ProxyServerService } from '../proxy-engine/proxy-server.service';
import { assertPortAvailable } from '../../common/utils/port-validation';
import { normalizeDomain } from '../../common/utils/proxy-format';
import { CreatePoolDto, UpdatePoolDto } from './dto';

/** Tirage unique et stable dans [min,max] (min==max ⇒ valeur fixe). */
function rollFakeCount(min: number, max: number): number {
  if (min >= max) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

@Injectable()
export class ProxyPoolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ProxyServerService,
  ) {}

  findAll() {
    return this.prisma.proxyPool.findMany({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreatePoolDto) {
    if (dto.port != null) await assertPortAvailable(this.prisma, dto.port);
    const fakeIpCount =
      dto.fakeIpCountMin != null && dto.fakeIpCountMax != null
        ? rollFakeCount(dto.fakeIpCountMin, dto.fakeIpCountMax)
        : null;
    const pool = await this.prisma.proxyPool.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        color: dto.color || '#6366f1',
        port: dto.port ?? null,
        domain: dto.domain ? normalizeDomain(dto.domain) || null : null,
        alwaysOnline: dto.alwaysOnline ?? false,
        fakeCountries: dto.fakeCountries || null,
        fakeIpCountMin: dto.fakeIpCountMin ?? null,
        fakeIpCountMax: dto.fakeIpCountMax ?? null,
        fakeIpCount,
      },
    });
    if (dto.port != null) this.engine.invalidatePortCache();
    return pool;
  }

  async update(id: string, dto: UpdatePoolDto) {
    if (dto.port != null) await assertPortAvailable(this.prisma, dto.port, { table: 'pool', id });

    // Ne re-tirer fakeIpCount que si min/max ont réellement changé — sinon
    // sauvegarder le formulaire (même sans toucher au champ) ferait sauter le
    // nombre simulé à chaque fois.
    let fakeIpCount: number | null | undefined;
    if (dto.fakeIpCountMin !== undefined || dto.fakeIpCountMax !== undefined) {
      const existing = await this.prisma.proxyPool.findUnique({ where: { id } });
      const min = dto.fakeIpCountMin !== undefined ? dto.fakeIpCountMin : existing?.fakeIpCountMin ?? null;
      const max = dto.fakeIpCountMax !== undefined ? dto.fakeIpCountMax : existing?.fakeIpCountMax ?? null;
      const changed = min !== (existing?.fakeIpCountMin ?? null) || max !== (existing?.fakeIpCountMax ?? null);
      fakeIpCount = changed && min != null && max != null ? rollFakeCount(min, max) : existing?.fakeIpCount ?? null;
    }

    try {
      const pool = await this.prisma.proxyPool.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.description !== undefined && { description: dto.description.trim() || null }),
          ...(dto.color !== undefined && { color: dto.color }),
          ...(dto.port !== undefined && { port: dto.port }),
          ...(dto.domain !== undefined && { domain: dto.domain ? normalizeDomain(dto.domain) || null : null }),
          ...(dto.alwaysOnline !== undefined && { alwaysOnline: dto.alwaysOnline }),
          ...(dto.fakeCountries !== undefined && { fakeCountries: dto.fakeCountries || null }),
          ...(dto.fakeIpCountMin !== undefined && { fakeIpCountMin: dto.fakeIpCountMin }),
          ...(dto.fakeIpCountMax !== undefined && { fakeIpCountMax: dto.fakeIpCountMax }),
          ...(fakeIpCount !== undefined && { fakeIpCount }),
        },
      });
      if (dto.port !== undefined) this.engine.invalidatePortCache();
      return pool;
    } catch {
      throw new NotFoundException('Pool introuvable');
    }
  }

  async remove(id: string) {
    try {
      const pool = await this.prisma.proxyPool.delete({ where: { id } });
      if (pool.port != null) this.engine.invalidatePortCache();
      return pool;
    } catch {
      throw new NotFoundException('Pool introuvable');
    }
  }
}
