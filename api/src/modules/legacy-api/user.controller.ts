import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBasicAuth, ApiOkResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { MasterKeyGuard } from '../../common/guards/master-key.guard';
import { Scopes } from '../../common/decorators/scopes.decorator';
import { PrismaService } from '../../database/prisma.service';

/** Agrégat GLOBAL (tous les comptes) — clé maître uniquement, cf. /api/v1/me/balance pour l'équivalent self-service. */
@ApiTags('legacy-user')
@ApiSecurity('x-api-key')
@ApiBasicAuth()
@Controller('api/v1/user')
@UseGuards(ApiKeyGuard, MasterKeyGuard)
export class UserController {
  constructor(private readonly prisma: PrismaService) {}

  @ApiOperation({ summary: 'Solde de trafic agrégé sur TOUS les comptes proxy du panel.' })
  @ApiOkResponse({
    schema: {
      example: {
        status: 'success',
        data: { total_gb_used: 412.5, total_gb_limit: 1000, remaining_gb: 587.5, status: 'active' },
      },
    },
  })
  @Get('balance')
  @Scopes('read:stats')
  async balance() {
    const users = await this.prisma.userProxy.findMany();
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
}
