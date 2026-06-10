import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { ScraperService } from '../scraper.service';
import { DynamicProvider } from '../providers/dynamic.provider';
import { CreateScraperSourceDto, UpdateScraperSourceDto } from '../dto/scraper-source.dto';
import { t } from '../../../common/utils/i18n';

/**
 * Gestion des sources de scraping (table ScraperSource), admin/JWT.
 * Le provider IA (Groq) est intégré et activé par sa clé — il n'apparaît pas ici.
 */
@ApiTags('panel-scraper')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api/panel/scraper-sources')
export class ScraperSourcesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scraper: ScraperService,
  ) {}

  @Get()
  async list() {
    const data = await this.prisma.scraperSource.findMany({ orderBy: { createdAt: 'desc' } });
    return { status: 'success', data };
  }

  @Post()
  async create(@Body() dto: CreateScraperSourceDto) {
    const data = await this.prisma.scraperSource.create({
      data: {
        name: dto.name,
        url: dto.url,
        protocol: dto.protocol ?? 'http',
        pattern: dto.pattern || null,
        enabled: dto.enabled ?? true,
        pool: dto.pool || null,
      },
    });
    return { status: 'success', data };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateScraperSourceDto) {
    try {
      const data = await this.prisma.scraperSource.update({
        where: { id },
        data: {
          name: dto.name,
          url: dto.url,
          protocol: dto.protocol,
          pattern: dto.pattern === undefined ? undefined : dto.pattern || null,
          enabled: dto.enabled,
          pool: dto.pool === undefined ? undefined : dto.pool || null,
        },
      });
      return { status: 'success', data };
    } catch {
      throw new NotFoundException(t('errors.sourceNotFound'));
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      await this.prisma.scraperSource.delete({ where: { id } });
      return { status: 'success' };
    } catch {
      throw new NotFoundException(t('errors.sourceNotFound'));
    }
  }

  /** Teste une source : récupère l'URL et compte les proxies extraits (échantillon). */
  @Post(':id/test')
  async test(@Param('id') id: string) {
    const s = await this.prisma.scraperSource.findUnique({ where: { id } });
    if (!s) throw new NotFoundException(t('errors.sourceNotFound'));
    const provider = new DynamicProvider(s.name, s.url, s.protocol, s.pattern);
    try {
      const items = await provider.fetch();
      return {
        status: 'success',
        count: items.length,
        sample: items.slice(0, 5).map((p) => `${p.ip}:${p.port}`),
      };
    } catch (e) {
      return { status: 'error', message: String((e as Error)?.message ?? e), count: 0 };
    }
  }

  /** Déclenche immédiatement un cycle de scraping (toutes sources). */
  @Post('run')
  async run() {
    // Fire & forget — le cycle peut être long.
    this.scraper.runOnce().catch(() => undefined);
    return { status: 'success', message: 'Cycle de scraping déclenché' };
  }
}
