import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreatePoolDto, UpdatePoolDto } from './dto';

@Injectable()
export class ProxyPoolsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.proxyPool.findMany({ orderBy: { name: 'asc' } });
  }

  create(dto: CreatePoolDto) {
    return this.prisma.proxyPool.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        color: dto.color || '#6366f1',
      },
    });
  }

  async update(id: string, dto: UpdatePoolDto) {
    try {
      return await this.prisma.proxyPool.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.description !== undefined && { description: dto.description.trim() || null }),
          ...(dto.color !== undefined && { color: dto.color }),
        },
      });
    } catch {
      throw new NotFoundException('Pool introuvable');
    }
  }

  async remove(id: string) {
    try {
      return await this.prisma.proxyPool.delete({ where: { id } });
    } catch {
      throw new NotFoundException('Pool introuvable');
    }
  }
}
