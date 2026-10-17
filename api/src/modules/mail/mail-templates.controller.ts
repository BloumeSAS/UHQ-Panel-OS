import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Scopes } from '../../common/decorators/scopes.decorator';
import { MailService } from './mail.service';
import { MAIL_TEMPLATE_BY_ID } from './mail-templates';
import { PrismaService } from '../../database/prisma.service';
import { Audited } from '../audit/audited.decorator';

class SaveTemplateDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsObject() subject?: Record<string, string>;
  @IsOptional() @IsObject() body?: Record<string, string>;
  @IsOptional() @IsBoolean() reset?: boolean;
}

class PreviewDto {
  @IsOptional() @IsIn(['fr', 'en']) lang?: 'fr' | 'en';
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(5000) body?: string;
}

class TestTemplateDto {
  @IsEmail() to!: string;
  @IsOptional() @IsIn(['fr', 'en']) lang?: 'fr' | 'en';
}

/** Gestion des modèles d'e-mails (ADMIN) : liste, activation, édition, aperçu, envoi de test. */
@ApiTags('panel-mail')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api/panel/mail')
export class MailTemplatesController {
  constructor(private readonly mail: MailService) {}

  @Get('templates')
  list() {
    return { status: 'success', data: this.mail.catalog(), smtpConfigured: this.mail.isConfigured() };
  }

  @Audited('mail.template-update')
  @Put('templates/:id')
  async save(@Param('id') id: string, @Body() dto: SaveTemplateDto) {
    if (!MAIL_TEMPLATE_BY_ID.has(id)) throw new NotFoundException();
    const clean = (o?: Record<string, string>) => {
      if (!o) return undefined;
      const out: Record<string, string> = {};
      for (const l of ['fr', 'en']) if (typeof o[l] === 'string') out[l] = o[l];
      return out;
    };
    await this.mail.saveTemplate(id, { enabled: dto.enabled, subject: clean(dto.subject), body: clean(dto.body), reset: dto.reset });
    return { status: 'success', data: this.mail.catalog().find((x) => x.id === id) };
  }

  /** Aperçu HTML exact (habillage compris) avec des valeurs d'exemple ; accepte un brouillon non enregistré. */
  @Post('templates/:id/preview')
  @HttpCode(200)
  preview(@Param('id') id: string, @Body() dto: PreviewDto, @Req() req: any) {
    // Aperçu seulement : le logo relatif est résolu sur l'origine du navigateur qui consulte l'aperçu.
    const host = String(req.headers?.host ?? '');
    const base = /^[A-Za-z0-9.:-]{1,100}$/.test(host) ? `${req.headers?.['x-forwarded-proto'] === 'https' ? 'https' : req.protocol}://${host}` : undefined;
    const r = this.mail.preview(id, dto.lang, { subject: dto.subject, body: dto.body }, base);
    if (!r) throw new NotFoundException();
    return { status: 'success', ...r };
  }

  /** Envoie le modèle (valeurs d'exemple) à l'adresse donnée, même s'il est désactivé. */
  @Audited('mail.template-test')
  @Post('templates/:id/test')
  @HttpCode(200)
  async test(@Param('id') id: string, @Body() dto: TestTemplateDto) {
    const def = MAIL_TEMPLATE_BY_ID.get(id);
    if (!def) throw new NotFoundException();
    if (!this.mail.isConfigured()) throw new BadRequestException('SMTP_NOT_CONFIGURED');
    const ok = await this.mail.sendTemplate(id, dto.to, def.sample, { lang: dto.lang, force: true });
    return ok ? { status: 'success' } : { status: 'error', message: 'SEND_FAILED' };
  }
}

class AddonMailDto {
  @IsString() @MaxLength(60) template!: string;
  /** Adresse d'un utilisateur du panel (jamais d'adresse arbitraire : pas de relais de spam). */
  @IsEmail() to!: string;
  @IsOptional() @IsObject() vars?: Record<string, unknown>;
  @IsOptional() @IsIn(['fr', 'en']) lang?: 'fr' | 'en';
}

/**
 * Envoi par un addon (clé API du panel) : POST /api/v1/mail/send { template, to, vars }.
 * Seuls les modèles marqués `addon` sont autorisés, et uniquement vers un utilisateur EXISTANT du panel.
 */
@ApiTags('legacy-mail')
@ApiSecurity('x-api-key')
@Controller('api/v1/mail')
@UseGuards(ApiKeyGuard)
export class AddonMailController {
  constructor(private readonly mail: MailService, private readonly prisma: PrismaService) {}

  @Post('send')
  @Scopes('send:mail')
  @HttpCode(200)
  async send(@Body() dto: AddonMailDto) {
    const def = MAIL_TEMPLATE_BY_ID.get(dto.template);
    if (!def || !def.addon) throw new BadRequestException('UNKNOWN_TEMPLATE');
    const to = dto.to.trim().toLowerCase();
    const user = await this.prisma.panelUser.findFirst({ where: { email: { equals: to, mode: 'insensitive' } }, select: { email: true } });
    if (!user) return { status: 'skipped', reason: 'unknown_user' };
    // Valeurs bornées (chaînes uniquement) : jamais d'objet ni de contenu arbitrairement long.
    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(dto.vars ?? {}).slice(0, 30)) {
      if (def.vars.includes(k) && (typeof v === 'string' || typeof v === 'number')) vars[k] = String(v).slice(0, 500);
    }
    const sent = await this.mail.sendTemplate(dto.template, user.email, vars, { lang: dto.lang });
    return { status: sent ? 'sent' : 'skipped', reason: sent ? undefined : this.mail.isEnabled(dto.template) ? 'smtp' : 'disabled' };
  }
}
