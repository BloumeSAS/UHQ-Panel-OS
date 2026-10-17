import { Controller, Delete, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SystemService } from './system.service';
import { Audited } from '../audit/audited.decorator';

/** Aides à l'ouverture : checklist « premiers pas », diagnostic, test de compte (ADMIN). */
@ApiTags('panel-system')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api/panel/system')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get('onboarding')
  async onboarding() {
    return { status: 'success', ...(await this.system.onboarding()) };
  }

  @Get('diagnostics')
  async diagnostics(@Req() req: any, @Res({ passthrough: true }) res: any) {
    res.setHeader('Cache-Control', 'no-store');
    return { status: 'success', ...(await this.system.diagnostics({ protocol: req.protocol, hostname: req.hostname })) };
  }

  @Audited('system.demo-create')
  @Post('demo')
  async createDemo() {
    return { status: 'success', ...(await this.system.createDemo()) };
  }

  @Audited('system.demo-remove')
  @Delete('demo')
  async removeDemo() {
    return { status: 'success', ...(await this.system.removeDemo()) };
  }

  @Get('support-info')
  async supportInfo(@Req() req: any) {
    return { status: 'success', ...(await this.system.supportInfo({ protocol: req.protocol, hostname: req.hostname })) };
  }

  @Post('test-account/:id')
  async testAccount(@Param('id') id: string) {
    return { status: 'success', result: await this.system.testAccount(id) };
  }
}

/** État du service — PUBLIC mais désactivé par défaut (Paramètres → Général) ; ne révèle aucun détail interne. */
@ApiTags('public-status')
@Controller('api/status')
export class PublicStatusController {
  constructor(private readonly system: SystemService) {}

  @Get()
  async status() {
    return { status: 'success', ...(await this.system.publicStatus()) };
  }
}
