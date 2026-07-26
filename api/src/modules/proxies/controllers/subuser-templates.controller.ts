import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';

interface TemplateDto {
  name: string;
  threads_limit?: number;
  traffic_limit_gb?: number | null;
  country_filter?: string | null;
  sticky_session_ttl?: number;
  bandwidth_limit?: number | null;
}

/** Profils réutilisables (threads/quota/pays) pour la création rapide de sous-users. */
@ApiTags('panel-subuser-templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api/panel/subuser-templates')
export class SubUserTemplatesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async list() {
    const data = await this.prisma.subUserTemplate.findMany({ orderBy: { name: 'asc' } });
    return { status: 'success', data };
  }

  @Post()
  async create(@Body() dto: TemplateDto, @CurrentUser() me: JwtUser) {
    const tpl = await this.prisma.subUserTemplate.create({
      data: {
        name: dto.name,
        threadsLimit: dto.threads_limit ?? 100,
        trafficLimitGb: dto.traffic_limit_gb ?? null,
        countryFilter: dto.country_filter || null,
        stickySessionTtl: dto.sticky_session_ttl ?? 1800,
        bandwidthLimit: dto.bandwidth_limit ?? null,
      },
    });
    void this.auditService
      .log({ userId: me.id, userEmail: me.email, action: 'subuser-template.create', target: tpl.id, details: { name: tpl.name } })
      .catch(() => undefined);
    return { status: 'success', data: tpl };
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() me: JwtUser) {
    await this.prisma.subUserTemplate.delete({ where: { id } }).catch(() => undefined);
    void this.auditService
      .log({ userId: me.id, userEmail: me.email, action: 'subuser-template.delete', target: id })
      .catch(() => undefined);
    return { status: 'success' };
  }
}
