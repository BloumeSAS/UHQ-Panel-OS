import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../../database/prisma.service';
import { CreateApiKeyDto, UpdateApiKeyDto } from '../../../common/dto/security.dto';

@ApiTags('panel-api-keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/panel/api-keys')
export class ApiKeysController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liste les clés API de l'utilisateur courant. */
  @Get()
  async list(@CurrentUser() me: JwtUser) {
    const keys = await this.prisma.apiKey.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: 'desc' },
    });
    return {
      status: 'success',
      data: keys.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        scopes: JSON.parse(k.scopes),
        expiresAt: k.expiresAt,
        lastUsed: k.lastUsed,
        isActive: k.isActive,
        createdAt: k.createdAt,
      })),
    };
  }

  /** Crée une nouvelle clé API. Retourne la clé en clair UNE SEULE FOIS. */
  @Post()
  async create(@CurrentUser() me: JwtUser, @Body() dto: CreateApiKeyDto) {
    const rawKey = 'uhq_' + crypto.randomBytes(32).toString('hex');
    const keyHash = await bcrypt.hash(rawKey, 10);
    const keyPrefix = rawKey.slice(0, 12); // "uhq_" + 8 chars

    const key = await this.prisma.apiKey.create({
      data: {
        userId: me.id,
        name: dto.name,
        keyHash,
        keyPrefix,
        scopes: JSON.stringify(dto.scopes ?? []),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    return {
      status: 'success',
      key: rawKey, // Only returned once
      data: {
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        scopes: dto.scopes ?? [],
        expiresAt: key.expiresAt,
        isActive: key.isActive,
        createdAt: key.createdAt,
      },
    };
  }

  /** Met à jour une clé API (nom, scopes, statut). */
  @Patch(':id')
  async update(
    @CurrentUser() me: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateApiKeyDto,
  ) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key || key.userId !== me.id) throw new NotFoundException('API key not found');

    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.scopes !== undefined && { scopes: JSON.stringify(dto.scopes) }),
        ...(dto.expiresAt !== undefined && { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }),
      },
    });

    return {
      status: 'success',
      data: {
        id: updated.id,
        name: updated.name,
        keyPrefix: updated.keyPrefix,
        scopes: JSON.parse(updated.scopes),
        expiresAt: updated.expiresAt,
        isActive: updated.isActive,
      },
    };
  }

  /** Supprime une clé API. */
  @Delete(':id')
  async remove(@CurrentUser() me: JwtUser, @Param('id') id: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key || key.userId !== me.id) throw new NotFoundException('API key not found');
    await this.prisma.apiKey.delete({ where: { id } });
    return { status: 'success' };
  }
}
