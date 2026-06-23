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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../../database/prisma.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../../common/guards/jwt-auth.guard';
import { formatSubUser } from '../../../common/utils/proxy-format';
import { AssignProxyDto, CreatePanelUserDto, UpdatePanelUserDto } from '../../../common/dto/panel.dto';
import { BulkUsersDto } from '../../../common/dto/security.dto';
import { t } from '../../../common/utils/i18n';

import { NotificationService } from '../../notifications/notification.service';

@ApiTags('panel-users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api/panel/users')
export class PanelUserController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  @Get()
  async list() {
    const users = await this.prisma.panelUser.findMany({
      orderBy: { createdAt: 'desc' },
      include: { assignedProxies: { select: { id: true, username: true, name: true } } },
    });
    return {
      status: 'success',
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        is_active: u.isActive,
        created_at: u.createdAt,
        expires_at: (u as any).expiresAt ?? null,
        totp_enabled: (u as any).totpEnabled ?? false,
        assigned_proxies: u.assignedProxies,
      })),
    };
  }

  @Post()
  async create(@Body() dto: CreatePanelUserDto) {
    const exists = await this.prisma.panelUser.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (exists) throw new BadRequestException(t('errors.emailTaken'));
    const u = await this.prisma.panelUser.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: dto.role ?? 'USER',
      },
    });
    void this.notificationService.notifyUserCreated(u.email, u.role);
    return { status: 'success', data: this.publicUser(u) };
  }

  /** Opérations en masse sur plusieurs utilisateurs. */
  @Post('bulk')
  async bulk(@Body() dto: BulkUsersDto, @CurrentUser() me: JwtUser) {
    if (!dto.ids?.length) throw new BadRequestException('No user IDs provided');

    switch (dto.action) {
      case 'activate':
        await this.prisma.panelUser.updateMany({
          where: { id: { in: dto.ids } },
          data: { isActive: true },
        });
        break;
      case 'deactivate': {
        const deactivateIds = dto.ids.filter((id) => id !== me.id);
        await this.prisma.panelUser.updateMany({
          where: { id: { in: deactivateIds } },
          data: { isActive: false },
        });
        break;
      }
      case 'delete': {
        const deleteIds = dto.ids.filter((id) => id !== me.id);
        await this.prisma.panelUser.deleteMany({ where: { id: { in: deleteIds } } });
        break;
      }
      default:
        throw new BadRequestException(`Unknown action: ${dto.action}`);
    }

    return { status: 'success', affected: dto.ids.length };
  }

  /** Export CSV des utilisateurs panel. */
  @Get('export.csv')
  async exportCsv() {
    const users = await this.prisma.panelUser.findMany({ orderBy: { createdAt: 'desc' } });
    const rows = users.map((u: any) =>
      [u.id, u.email, u.role, u.isActive ? 'active' : 'inactive', u.createdAt.toISOString(), u.expiresAt?.toISOString() ?? ''].join(',')
    );
    const csv = ['id,email,role,status,created_at,expires_at', ...rows].join('\n');
    return { status: 'success', csv };
  }

  @ApiParam({ name: 'id', description: 'ID de l\'utilisateur panel' })
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePanelUserDto) {
    const data: any = {};
    if (dto.email !== undefined) {
      const normalized = dto.email.toLowerCase();
      const exists = await this.prisma.panelUser.findFirst({ where: { email: normalized, NOT: { id } } });
      if (exists) throw new BadRequestException(t('errors.emailTaken'));
      data.email = normalized;
    }
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.password !== undefined) data.passwordHash = await bcrypt.hash(dto.password, 10);
    if (dto.expiresAt !== undefined) {
      data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }
    try {
      const u = await this.prisma.panelUser.update({ where: { id }, data });
      return { status: 'success', data: this.publicUser(u) };
    } catch {
      throw new NotFoundException(t('errors.userNotFound'));
    }
  }

  @ApiParam({ name: 'id', description: 'ID de l\'utilisateur panel' })
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() me: JwtUser) {
    if (id === me.id) throw new BadRequestException(t('errors.cannotDeleteSelf'));
    try {
      await this.prisma.panelUser.delete({ where: { id } });
      return { status: 'success' };
    } catch {
      throw new NotFoundException(t('errors.userNotFound'));
    }
  }

  /** Liste des comptes proxy assignés à ce PanelUser. */
  @ApiParam({ name: 'id', description: 'ID de l\'utilisateur panel' })
  @Get(':id/proxies')
  async proxies(@Param('id') id: string) {
    const proxies = await this.prisma.userProxy.findMany({ where: { ownerId: id } });
    return { status: 'success', data: proxies.map((u) => ({ ...formatSubUser(u), port: u.port ?? null, domain: u.domain ?? null })) };
  }

  @ApiParam({ name: 'id', description: 'ID de l\'utilisateur panel' })
  @Post(':id/assign')
  async assign(@Param('id') id: string, @Body() dto: AssignProxyDto) {
    const user = await this.prisma.panelUser.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(t('errors.userNotFound'));
    try {
      await this.prisma.userProxy.update({ where: { id: dto.proxyId }, data: { ownerId: id } });
    } catch {
      throw new NotFoundException(t('errors.proxyNotFound'));
    }
    return { status: 'success' };
  }

  @ApiParam({ name: 'id', description: 'ID de l\'utilisateur panel' })
  @Post(':id/unassign')
  async unassign(@Param('id') id: string, @Body() dto: AssignProxyDto) {
    try {
      await this.prisma.userProxy.update({
        where: { id: dto.proxyId },
        data: { ownerId: null },
      });
    } catch {
      throw new NotFoundException(t('errors.proxyNotFound'));
    }
    return { status: 'success' };
  }

  private publicUser(u: any) {
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      is_active: u.isActive,
      created_at: u.createdAt,
      expires_at: u.expiresAt ?? null,
      totp_enabled: u.totpEnabled ?? false,
    };
  }
}
