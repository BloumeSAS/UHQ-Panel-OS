import { Body, Controller, Get, Post, Put, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as bcrypt from 'bcryptjs';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../../common/guards/jwt-auth.guard';
import { SettingsService } from '../../../config/settings.service';
import { PrismaService } from '../../../database/prisma.service';
import { UpdateSettingsDto, SmtpTestDto, WebhookTestDto, RevealSettingDto, REVEALABLE_SECRETS } from '../../../common/dto/panel.dto';
import { MailService } from '../../mail/mail.service';
import { NotificationService } from '../../notifications/notification.service';
import { t } from '../../../common/utils/i18n';

@ApiTags('panel-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api/panel/settings')
export class PanelSettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationService,
  ) {}

  /** Toutes les clés résolues, secrets masqués. */
  @Get()
  get() {
    return { status: 'success', data: this.settings.getAllMasked() };
  }

  /**
   * Met à jour les clés fournies. Pour les secrets, une valeur vide / le masque
   * est ignorée (on ne réécrase jamais un secret par accident).
   */
  @Put()
  async update(@Body() dto: UpdateSettingsDto) {
    const patch: Record<string, string> = {};
    for (const [k, v] of Object.entries(dto)) {
      if (v === undefined) continue;
      patch[k] = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
    }
    // La clé API n'est jamais modifiée via cet endpoint (cf. /api-key/*).
    delete (patch as any).apiKey;
    // L'URL de mise à jour ne peut pas être modifiée depuis le panel.
    delete (patch as any).updateCheckUrl;
    // Ne pas écraser un secret avec une valeur vide ou le masque.
    for (const secret of REVEALABLE_SECRETS) {
      const val = patch[secret];
      if (val !== undefined && (val.trim() === '' || /^•+$/.test(val))) {
        delete patch[secret];
      }
    }
    await this.settings.setMany(patch as any);
    return { status: 'success', data: this.settings.getAllMasked() };
  }

  /**
   * Révèle la valeur en clair d'un secret masqué (proxy de secours, clé Groq,
   * mot de passe SMTP…), après confirmation du mot de passe du compte panel
   * courant. Les secrets ne sont JAMAIS renvoyés en clair par GET /settings —
   * c'est la seule voie pour les consulter une fois saisis.
   */
  @Post('reveal')
  async reveal(@CurrentUser() me: JwtUser, @Body() dto: RevealSettingDto) {
    const user = await this.prisma.panelUser.findUnique({ where: { id: me.id } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException(t('errors.invalidPassword'));
    }
    return { status: 'success', value: this.settings.get(dto.key as any) };
  }

  /** Révèle la clé API courante (admin) — pour copie/usage. La génère si absente. */
  @Get('api-key')
  async getApiKey() {
    return { status: 'success', apiKey: await this.settings.ensureApiKey() };
  }

  /** Régénère la clé API (invalide l'ancienne) et renvoie la nouvelle. */
  @Post('api-key/regenerate')
  async regenerateApiKey() {
    return { status: 'success', apiKey: await this.settings.regenerateApiKey() };
  }

  /** Envoie un e-mail de test à l'adresse fournie pour vérifier la config SMTP. */
  @Post('smtp/test')
  async testSmtp(@Body() body: SmtpTestDto) {
    if (!body.email) return { status: 'error', message: t('info.emailRequired') };
    const ok = await this.mail.sendTest(body.email, this.settings.get('siteName'));
    return ok
      ? { status: 'success', message: t('info.smtpTestSent') }
      : { status: 'error', message: t('info.smtpTestFailed') };
  }

  /** Envoie un message de test sur le webhook Discord, Slack ou BloumeChat configuré. */
  @Post('webhook/test')
  async testWebhook(@Body() body: WebhookTestDto) {
    const target = body.target as 'discord' | 'slack' | 'bloumechat';
    const res = await this.notifications.sendTestWebhook(target);
    if (res.ok) return { status: 'success', message: t('info.webhookTestSent') };
    if (res.error === 'not_configured') {
      return { status: 'error', message: t('info.webhookNotConfigured') };
    }
    return { status: 'error', message: `${t('info.webhookTestFailed')} (${res.status ?? res.error ?? 'erreur'}).` };
  }
}
