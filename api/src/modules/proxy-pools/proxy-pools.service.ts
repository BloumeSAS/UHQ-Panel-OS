import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ProxyServerService } from '../proxy-engine/proxy-server.service';
import { assertPortAvailable } from '../../common/utils/port-validation';
import { normalizeDomain } from '../../common/utils/proxy-format';
import { CreatePoolDto, UpdatePoolDto } from './dto';

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
    const pool = await this.prisma.proxyPool.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        color: dto.color || '#6366f1',
        port: dto.port ?? null,
        domain: dto.domain ? normalizeDomain(dto.domain) || null : null,
      },
    });
    if (dto.port != null) this.engine.invalidatePortCache();
    return pool;
  }

  async update(id: string, dto: UpdatePoolDto) {
    if (dto.port != null) await assertPortAvailable(this.prisma, dto.port, { table: 'pool', id });
    try {
      const pool = await this.prisma.proxyPool.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.description !== undefined && { description: dto.description.trim() || null }),
          ...(dto.color !== undefined && { color: dto.color }),
          ...(dto.port !== undefined && { port: dto.port }),
          ...(dto.domain !== undefined && { domain: dto.domain ? normalizeDomain(dto.domain) || null : null }),
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
