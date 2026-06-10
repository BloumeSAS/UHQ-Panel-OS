import {
  BadRequestException,
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
import { request } from 'undici';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { SettingsService } from '../../../config/settings.service';
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
    private readonly settings: SettingsService,
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

  /** Supprime TOUTES les sources de scraping. */
  @Delete()
  async removeAll() {
    const res = await this.prisma.scraperSource.deleteMany({});
    return { status: 'success', deleted: res.count };
  }

  /** Supprime les sources dont les IDs sont fournis. */
  @Post('bulk-delete')
  async bulkRemove(@Body() body: { ids: string[] }) {
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      throw new BadRequestException('ids manquants');
    }
    const res = await this.prisma.scraperSource.deleteMany({
      where: { id: { in: body.ids } },
    });
    return { status: 'success', deleted: res.count };
  }

  /**
   * Récupère un échantillon de l'URL et demande à Groq de déduire le pattern regex
   * (2 groupes capturants : IP/host, port). Requiert groqApiKey configurée.
   */
  @Post('detect-pattern')
  async detectPattern(@Body() body: { url: string }) {
    if (!body?.url) throw new BadRequestException('url manquante');

    // settings.get() est synchrone (cache in-memory)
    const apiKey = this.settings.get('groqApiKey').trim();
    if (!apiKey) return { status: 'error', message: 'Clé API Groq non configurée' };

    // ── Fetch sample ──────────────────────────────────────────────────────────
    let sample: string;
    try {
      const res = await request(body.url, {
        headersTimeout: 15_000,
        bodyTimeout: 15_000,
        maxRedirections: 5,
      });
      const raw = await res.body.text();
      // Garde le texte brut en priorité (listes plain-text), supprime le HTML si présent
      const stripped = raw.includes('<html') || raw.includes('<body')
        ? raw
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, '\n')
        : raw;
      sample = stripped.slice(0, 3_000);
    } catch (e) {
      return { status: 'error', message: `Impossible de récupérer l'URL : ${String((e as Error).message ?? e)}` };
    }

    if (!sample.trim()) {
      return { status: 'error', message: 'Contenu vide — impossible de détecter le pattern' };
    }

    // ── Groq ──────────────────────────────────────────────────────────────────
    // Modèles Groq actifs en 2026 (du plus capable au plus rapide)
    const MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it'];
    let lastError = '';

    for (const model of MODELS) {
      try {
        const payload = {
          model,
          messages: [
            {
              role: 'system',
              content:
                'You are a regex expert. Return ONLY a single raw regex pattern with exactly 2 capture groups: group 1 for the IP address or hostname, group 2 for the port number. No explanation, no code block, no quotes — just the regex pattern itself.',
            },
            {
              role: 'user',
              content: `Detect the proxy format in this content and return the regex.\nFormats: ip:port | ip:port:user:pass | user:pass@ip:port | protocol://user:pass@host:port\n\n${sample}`,
            },
          ],
          temperature: 0,
          max_tokens: 150,
        };
        const res = await request('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(payload),
          headersTimeout: 30_000,
          bodyTimeout: 30_000,
        });

        if (res.statusCode >= 400) {
          let detail = '';
          try { detail = JSON.stringify((await res.body.json() as any)?.error ?? ''); } catch {}
          lastError = `HTTP ${res.statusCode}${detail ? ` — ${detail.slice(0, 200)}` : ''}`;
          continue; // essaie le prochain modèle
        }

        const json = (await res.body.json()) as any;
        const raw = (json?.choices?.[0]?.message?.content ?? '').trim();
        const pattern = raw
          .replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '')
          .replace(/^["'`]|["'`]$/g, '')
          .trim();

        try { new RegExp(pattern); } catch {
          lastError = `Pattern retourné invalide : ${pattern.slice(0, 100)}`;
          continue;
        }
        return { status: 'success', pattern };
      } catch (e) {
        lastError = String((e as Error).message ?? e);
      }
    }

    return { status: 'error', message: `Groq : ${lastError}` };
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
