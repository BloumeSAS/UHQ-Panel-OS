import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../../database/prisma.service';

@ApiTags('panel-notifications-inbox')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/panel/notifications')
export class InboxController {
  constructor(private readonly prisma: PrismaService) {}

  /** Notifications de l'utilisateur courant (+ globales pour l'admin). */
  @ApiQuery({ name: 'unread', required: false, type: Boolean })
  @Get()
  async list(@CurrentUser() me: JwtUser, @Query('unread') unread?: string) {
    const where: any = {};
    if (me.role === 'ADMIN') {
      where.OR = [{ userId: me.id }, { userId: null }];
    } else {
      where.userId = me.id;
    }
    if (unread === 'true') where.read = false;

    const items = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return { status: 'success', data: items };
  }

  /** Compte les notifications non lues. */
  @Get('unread-count')
  async unreadCount(@CurrentUser() me: JwtUser) {
    const where: any = { read: false };
    if (me.role === 'ADMIN') {
      where.OR = [{ userId: me.id }, { userId: null }];
    } else {
      where.userId = me.id;
    }
    const count = await this.prisma.notification.count({ where });
    return { status: 'success', count };
  }

  /** Marque toutes les notifications comme lues. */
  @Post('mark-read')
  async markAllRead(@CurrentUser() me: JwtUser) {
    const where: any = { read: false };
    if (me.role === 'ADMIN') {
      where.OR = [{ userId: me.id }, { userId: null }];
    } else {
      where.userId = me.id;
    }
    await this.prisma.notification.updateMany({
      where,
      data: { read: true },
    });
    return { status: 'success' };
  }

  /** Marque une notification spécifique comme lue. */
  @Post('mark-read/:id')
  async markRead(@CurrentUser() me: JwtUser, @Query('id') id: string) {
    const where: any = { id };
    if (me.role === 'ADMIN') {
      where.OR = [{ userId: me.id }, { userId: null }];
    } else {
      where.userId = me.id;
    }
    await this.prisma.notification.updateMany({
      where,
      data: { read: true },
    });
    return { status: 'success' };
  }
}
