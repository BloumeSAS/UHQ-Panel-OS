import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { SettingsService } from '../../../config/settings.service';
import { UpdateSettingsDto, SmtpTestDto } from '../../../common/dto/panel.dto';
import { MailService } from '../../mail/mail.service';

@ApiTags('panel-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api/panel/settings')
export class PanelSettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly mail: MailService,
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
    for (const secret of ['scraperProxy', 'groqApiKey', 'smtpPass', 'captchaSecretKey', 'discordWebhookUrl', 'slackWebhookUrl', 'backupS3SecretKey'] as const) {
      const val = patch[secret];
      if (val !== undefined && (val.trim() === '' || /^•+$/.test(val))) {
        delete patch[secret];
      }
    }
    await this.settings.setMany(patch as any);
    return { status: 'success', data: this.settings.getAllMasked() };
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
    if (!body.email) return { status: 'error', message: 'Adresse e-mail requise.' };
    const ok = await this.mail.sendTest(body.email, this.settings.get('siteName'));
    return ok
      ? { status: 'success', message: 'E-mail de test envoyé.' }
      : { status: 'error', message: 'Échec — vérifiez la configuration SMTP.' };
  }
}
