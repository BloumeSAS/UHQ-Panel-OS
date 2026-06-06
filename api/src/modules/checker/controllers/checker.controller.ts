import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CheckerService } from '../checker.service';
import { PrismaService } from '../../../database/prisma.service';

@ApiTags('panel-checker')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api/panel/checker')
export class CheckerController {
  constructor(
    private readonly checker: CheckerService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  async status() {
    const status = this.checker.getStatus();
    const total = await this.prisma.backendProxy.count();
    const working = await this.prisma.backendProxy.count({ where: { isWorking: true, isBlacklisted: false } });
    const dead = await this.prisma.backendProxy.count({ where: { isWorking: false, isBlacklisted: false } });
    const blacklisted = await this.prisma.backendProxy.count({ where: { isBlacklisted: true } });

    const countries = await this.prisma.backendProxy.groupBy({
      by: ['country'],
      where: { isWorking: true },
      _count: { id: true },
    });

    return {
      status: 'success',
      data: {
        ...status,
        pool: {
          total,
          working,
          dead,
          blacklisted,
        },
        countries: countries.map((c) => ({
          country: c.country || 'Unknown',
          count: c._count.id,
        })),
      },
    };
  }

  @Post('run')
  async run() {
    this.checker.runOnce().catch(() => undefined);
    return { status: 'success', message: 'Cycle de vérification déclenché' };
  }
}
