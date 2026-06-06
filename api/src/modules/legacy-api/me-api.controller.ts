import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBasicAuth, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { Scopes } from '../../common/decorators/scopes.decorator';
import { PrismaService } from '../../database/prisma.service';
import { ProxyServerService } from '../proxy-engine/proxy-server.service';
import { buildStickyList, formatSubUser } from '../../common/utils/proxy-format';
import { SettingsService } from '../../config/settings.service';

/**
 * Endpoints API v1 accessibles par clé API pour un simple USER.
 * Toutes les requêtes sont isolées pour ne manipuler que les proxies
 * appartenant à l'utilisateur associé à la clé API.
 */
@ApiTags('legacy-me')
@ApiSecurity('x-api-key')
@ApiBasicAuth()
@Controller('api/v1/me')
@UseGuards(ApiKeyGuard)
export class MeApiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ProxyServerService,
    private readonly settings: SettingsService,
  ) {}

  @Get('balance')
  @Scopes('read:stats')
  async balance(@Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new HttpException('Context utilisateur manquant', HttpStatus.BAD_REQUEST);
    }
    const users = await this.prisma.userProxy.findMany({
      where: { ownerId: userId },
    });
    const totalBytes = users.reduce(
      (acc, u) => acc + Number(u.totalBytesSent) + Number(u.totalBytesReceived),
      0,
    );
    const totalLimit = users.reduce(
      (acc, u) => acc + (u.trafficLimit ? Number(u.trafficLimit) : 0),
      0,
    );
    const gbUsed = Math.round((totalBytes / 1024 ** 3) * 10000) / 10000;
    const gbLimit = totalLimit ? Math.round((totalLimit / 1024 ** 3) * 10000) / 10000 : 0;
    return {
      status: 'success',
      data: {
        total_gb_used: gbUsed,
        total_gb_limit: gbLimit,
        remaining_gb: gbLimit ? Math.max(0, gbLimit - gbUsed) : 999999,
        status: 'active',
      },
    };
  }

  @Get('proxies')
  @Scopes('read:proxies')
  async list(@Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new HttpException('Context utilisateur manquant', HttpStatus.BAD_REQUEST);
    }
    const users = await this.prisma.userProxy.findMany({
      where: { ownerId: userId },
    });
    return { status: 'success', data: users.map(formatSubUser) };
  }

  @ApiQuery({ name: 'id', required: true, description: 'ID du proxy' })
  @ApiQuery({ name: 'count', required: false, type: Number, description: 'Nombre de proxies à générer (1-1000, défaut 100)' })
  @Get('proxies/sticky-list')
  @Scopes('read:proxies')
  async stickyProxies(
    @Req() req: any,
    @Query('id') id: string,
    @Query('count') count: string = '100',
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new HttpException('Context utilisateur manquant', HttpStatus.BAD_REQUEST);
    }
    const c = Math.max(1, Math.min(1000, parseInt(count, 10) || 100));
    const user = await this.prisma.userProxy.findFirst({
      where: { id, ownerId: userId },
    });
    if (!user) {
      throw new HttpException('Proxy introuvable ou non autorisé', HttpStatus.NOT_FOUND);
    }
    const host = this.settings.get('publicProxyHost');
    const port = this.settings.get('publicProxyPort');
    const lines = buildStickyList(user, host, port, c);
    return {
      status: 'success',
      format: 'host:port:username:session:password',
      count: lines.length,
      proxies: lines,
    };
  }

  @ApiQuery({ name: 'id', required: true, description: 'ID du proxy' })
  @Get('proxies/stats')
  @Scopes('read:stats')
  async usageStat(@Req() req: any, @Query('id') id: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new HttpException('Context utilisateur manquant', HttpStatus.BAD_REQUEST);
    }
    const user = await this.prisma.userProxy.findFirst({
      where: { id, ownerId: userId },
    });
    if (!user) {
      throw new HttpException('Proxy introuvable ou non autorisé', HttpStatus.NOT_FOUND);
    }
    const active = this.engine.getActiveThreads().get(user.username) ?? 0;
    const totalBytes = Number(user.totalBytesSent) + Number(user.totalBytesReceived);
    return {
      status: 'success',
      data: {
        sub_user_id: user.id,
        total_bytes: totalBytes,
        gb_used: Math.round((totalBytes / 1024 ** 3) * 10000) / 10000,
        sent: Number(user.totalBytesSent),
        received: Number(user.totalBytesReceived),
        active_threads: active,
        threads_limit: user.threadsLimit,
      },
    };
  }
}
