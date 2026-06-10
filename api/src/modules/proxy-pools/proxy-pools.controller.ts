import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ProxyPoolsService } from './proxy-pools.service';
import { CreatePoolDto, UpdatePoolDto } from './dto';

@ApiTags('panel-proxy-pools')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api/panel/proxy-pools')
export class ProxyPoolsController {
  constructor(private readonly service: ProxyPoolsService) {}

  @Get()
  @ApiOperation({ summary: 'Liste tous les pools de proxies' })
  async list() {
    return { status: 'success', data: await this.service.findAll() };
  }

  @Post()
  @ApiOperation({ summary: 'Crée un pool de proxies' })
  async create(@Body() dto: CreatePoolDto) {
    return { status: 'success', data: await this.service.create(dto) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Met à jour un pool de proxies' })
  async update(@Param('id') id: string, @Body() dto: UpdatePoolDto) {
    return { status: 'success', data: await this.service.update(id, dto) };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprime un pool de proxies' })
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return { status: 'success' };
  }
}
