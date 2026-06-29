import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/guards/jwt-auth.guard';
import { ProxyPoolsService } from './proxy-pools.service';
import { CreatePoolDto, UpdatePoolDto } from './dto';
import { AuditService } from '../audit/audit.service';

@ApiTags('panel-proxy-pools')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api/panel/proxy-pools')
export class ProxyPoolsController {
  constructor(
    private readonly service: ProxyPoolsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liste tous les pools de proxies' })
  async list() {
    return { status: 'success', data: await this.service.findAll() };
  }

  @Post()
  @ApiOperation({ summary: 'Crée un pool de proxies' })
  async create(@Body() dto: CreatePoolDto, @CurrentUser() me: JwtUser) {
    const pool = await this.service.create(dto);
    void this.auditService
      .log({ userId: me.id, userEmail: me.email, action: 'pool.create', target: pool.id, details: { name: pool.name } })
      .catch(() => undefined);
    return { status: 'success', data: pool };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Met à jour un pool de proxies' })
  async update(@Param('id') id: string, @Body() dto: UpdatePoolDto, @CurrentUser() me: JwtUser) {
    const pool = await this.service.update(id, dto);
    void this.auditService
      .log({ userId: me.id, userEmail: me.email, action: 'pool.update', target: id, details: { changed: Object.keys(dto) } })
      .catch(() => undefined);
    return { status: 'success', data: pool };
  }

  @Post(':id/reroll-fake-ips')
  @ApiOperation({ summary: "Retire un nouveau nombre d'IP simulé pour chaque pays déjà configuré" })
  async rerollFakeIps(@Param('id') id: string, @CurrentUser() me: JwtUser) {
    const pool = await this.service.rerollFakeIps(id);
    void this.auditService
      .log({ userId: me.id, userEmail: me.email, action: 'pool.reroll_fake_ips', target: id })
      .catch(() => undefined);
    return { status: 'success', data: pool };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprime un pool de proxies' })
  async remove(@Param('id') id: string, @CurrentUser() me: JwtUser) {
    await this.service.remove(id);
    void this.auditService
      .log({ userId: me.id, userEmail: me.email, action: 'pool.delete', target: id })
      .catch(() => undefined);
    return { status: 'success' };
  }
}
