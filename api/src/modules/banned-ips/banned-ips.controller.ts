import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/guards/jwt-auth.guard';
import { BannedIpsService } from './banned-ips.service';
import { BanIpDto, UnbanManyDto } from '../../common/dto/banned-ip.dto';
import { AuditService } from '../audit/audit.service';

@ApiTags('panel-banned-ips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api/panel/banned-ips')
export class BannedIpsController {
  constructor(
    private readonly bannedIps: BannedIpsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async list() {
    const data = await this.bannedIps.list();
    return { status: 'success', data };
  }

  /** Bannit une ou plusieurs IP en un seul appel (bannissement en masse). */
  @Post()
  async ban(@CurrentUser() me: JwtUser, @Body() dto: BanIpDto) {
    const data = await this.bannedIps.banMany(dto.ips, dto.reason, dto.expiresAt, me.email);
    await this.auditService.log({
      userId: me.id,
      userEmail: me.email,
      action: 'banned-ip.create',
      target: dto.ips.join(', '),
      details: { reason: dto.reason, expiresAt: dto.expiresAt, count: dto.ips.length },
    });
    return { status: 'success', data };
  }

  @Delete(':id')
  async unban(@CurrentUser() me: JwtUser, @Param('id') id: string) {
    await this.bannedIps.unban(id);
    await this.auditService.log({ userId: me.id, userEmail: me.email, action: 'banned-ip.delete', target: id });
    return { status: 'success' };
  }

  /** Débannit plusieurs IP sélectionnées en même temps. */
  @Post('unban-many')
  async unbanMany(@CurrentUser() me: JwtUser, @Body() dto: UnbanManyDto) {
    const count = await this.bannedIps.unbanMany(dto.ids);
    await this.auditService.log({
      userId: me.id,
      userEmail: me.email,
      action: 'banned-ip.delete-many',
      details: { count },
    });
    return { status: 'success', count };
  }
}
