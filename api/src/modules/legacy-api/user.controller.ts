import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBasicAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { Scopes } from '../../common/decorators/scopes.decorator';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('legacy-user')
@ApiSecurity('x-api-key')
@ApiBasicAuth()
@Controller('api/v1/user')
@UseGuards(ApiKeyGuard)
export class UserController {
  constructor(private readonly prisma: PrismaService) {}

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
