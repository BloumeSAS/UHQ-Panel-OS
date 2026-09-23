import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/guards/jwt-auth.guard';
import { AuditService } from '../audit/audit.service';
import { ExtensionsService } from './extensions.service';

@ApiTags('panel-extensions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api/panel/extensions')
export class ExtensionsController {
  constructor(
    private readonly extensions: ExtensionsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list() {
    return { status: 'success', data: await this.extensions.list() };
  }

  @Post(':key/enable')
  async enable(@CurrentUser() me: JwtUser, @Param('key') key: string) {
    const result = await this.extensions.setEnabled(key, true);
    void this.audit.log({ userId: me.id, userEmail: me.email, action: 'extension.enable', target: key });
    return { status: 'success', data: result };
  }

  @Post(':key/disable')
  async disable(@CurrentUser() me: JwtUser, @Param('key') key: string) {
    const result = await this.extensions.setEnabled(key, false);
    void this.audit.log({ userId: me.id, userEmail: me.email, action: 'extension.disable', target: key });
    return { status: 'success', data: result };
  }
}
