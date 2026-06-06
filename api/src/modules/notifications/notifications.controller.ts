import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('panel-notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/panel/notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('unread-count')
  async unreadCount(@CurrentUser() me: JwtUser) {
    const where: any = { read: false };
    if (me.role === 'ADMIN') {
      where.OR = [
        { userId: me.id },
        { userId: null },
      ];
    } else {
      where.userId = me.id;
    }
    const count = await this.prisma.notification.count({ where });
    return { count };
  }

  @Get()
  async list(@CurrentUser() me: JwtUser) {
    const where: any = {};
    if (me.role === 'ADMIN') {
      where.OR = [
        { userId: me.id },
        { userId: null },
      ];
    } else {
      where.userId = me.id;
    }
    const notifications = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { status: 'success', data: notifications };
  }

  @Post('mark-read')
  async markRead(@CurrentUser() me: JwtUser) {
    const where: any = { read: false };
    if (me.role === 'ADMIN') {
      where.OR = [
        { userId: me.id },
        { userId: null },
      ];
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
