import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import { SettingsService } from '../../../config/settings.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../../common/guards/jwt-auth.guard';
import { LoginDto, Login2faDto, RegisterDto, SetupDto, ForgotPasswordDto, ResetPasswordDto } from '../../../common/dto/panel.dto';
import { t } from '../../../common/utils/i18n';
import { verifyCaptcha, type CaptchaProvider } from '../../../common/utils/captcha.util';
import { getClientIp } from '../../../common/utils/client-ip';
import { MailService } from '../../mail/mail.service';
import { RateLimiterService } from '../../../common/rate-limiter.service';
import { authenticator } from '@otplib/preset-default';
import { consumeRecoveryCode } from '../../../common/utils/recovery-codes';

const SINGLETON = 'singleton';

import { NotificationService } from '../../notifications/notification.service';
import { APP_VERSION } from '../../../version';
import { AuditService } from '../../audit/audit.service';

@ApiTags('panel-auth')
@Controller('api/panel')
export class PanelAuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  // Cf. common/utils/client-ip.ts : priorise CF-Connecting-IP (Cloudflare)
  // avant le calcul Express `req.ip`, mais UNIQUEMENT si l'admin a confirmé
  // (Paramètres → Sécurité) que l'origine est injoignable autrement — sinon
  // l'en-tête est falsifiable par n'importe quel client direct.
  private clientIp(req: any): string {
    return getClientIp(req, this.settings.getBool('trustCloudflareIps'));
  }

  /** Lecture publique : pilote l'écran de démarrage du front. */
  @Get('setup/status')
  async setupStatus() {
    const meta = await this.prisma.appMeta.findUnique({ where: { id: SINGLETON } });
    const adminCount = await this.prisma.panelUser.count({ where: { role: 'ADMIN' } });
    const setupCompleted = !!meta?.setupCompleted && adminCount > 0;
    return {
      setupCompleted,
      registrationEnabled: this.settings.getBool('registrationEnabled'),
      siteName: this.settings.get('siteName'),
      logoUrl: this.settings.get('logoUrl'),
      defaultLang: this.settings.get('defaultLang'),
      version: APP_VERSION,
      captchaProvider: this.settings.get('captchaProvider'),
      captchaSiteKey: this.settings.get('captchaSiteKey'),
      captchaCapEndpoint: this.settings.get('captchaCapEndpoint'),
      resetPasswordEnabled:
        this.settings.getBool('emailResetEnabled') && this.mail.isConfigured(),
      maintenanceModeEnabled: this.settings.getBool('maintenanceModeEnabled'),
      themeColors: this.settings.get('themeColors') || null,
    };
  }

  /** Premier démarrage : crée le 1er admin + config initiale. Verrouillé ensuite. */
  @Post('setup')
  async setup(@Body() dto: SetupDto, @Req() req: any) {
    const meta = await this.prisma.appMeta.findUnique({ where: { id: SINGLETON } });
    const adminCount = await this.prisma.panelUser.count({ where: { role: 'ADMIN' } });
    if (meta?.setupCompleted && adminCount > 0) {
      throw new ForbiddenException(t('errors.setupDone'));
    }

    const admin = await this.prisma.panelUser.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: 'ADMIN',
      },
    });

    await this.settings.setMany({
      siteName: dto.siteName,
      publicProxyHost: dto.publicProxyHost,
      publicProxyPort: dto.publicProxyPort,
      registrationEnabled: dto.registrationEnabled ? 'true' : 'false',
      defaultLang: dto.defaultLang,
      scrapeInterval: dto.scrapeInterval,
      proxyCheckInterval: dto.proxyCheckInterval,
      geoResolveInterval: dto.geoResolveInterval,
      checkerConcurrency: dto.checkerConcurrency,
      scraperProxy: dto.scraperProxy,
      groqApiKey: dto.groqApiKey,
    });
    await this.settings.ensureApiKey();

    await this.prisma.appMeta.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, setupCompleted: true },
      update: { setupCompleted: true },
    });

    const token = this.sign(admin);
    await this.createSession(admin.id, token, req);
    return { status: 'success', token, user: this.publicUser(admin) };
  }

  @Post('auth/register')
  async register(@Body() body: RegisterDto, @Req() req: any) {
    if (!this.settings.getBool('registrationEnabled')) {
      throw new ForbiddenException(t('errors.registrationDisabled'));
    }

    await this.assertCaptcha(body.captchaToken);

    const exists = await this.prisma.panelUser.findUnique({
      where: { email: body.email.toLowerCase() },
    });
    if (exists) throw new BadRequestException(t('errors.emailTaken'));

    const user = await this.prisma.panelUser.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash: await bcrypt.hash(body.password, 10),
        role: 'USER',
      },
    });

    // E-mail de bienvenue (si SMTP configuré et option activée)
    void this.mail.sendWelcome(user.email, this.settings.get('siteName'));
    void this.notificationService.notifyUserCreated(user.email, user.role);

    const token = this.sign(user);
    await this.createSession(user.id, token, req);
    return { status: 'success', token, user: this.publicUser(user) };
  }

  @Post('auth/login')
  async login(@Body() body: LoginDto, @Req() req: any) {
    // Frein anti-brute-force : le captcha (`captchaProvider`) est le seul
    // autre garde-fou et n'est pas configuré par défaut sur une install
    // fraîche — sans ça, /auth/login accepte un débit illimité de tentatives
    // contre un email admin connu. Double clé (IP globale + IP+email) pour
    // freiner aussi bien le spray multi-comptes que le brute-force ciblé.
    const ip = this.clientIp(req);
    const email = body.email.toLowerCase();
    if (!this.rateLimiter.check(`login:ip:${ip}`, 20, 60_000) || !this.rateLimiter.check(`login:ip-email:${ip}:${email}`, 5, 60_000)) {
      throw new UnauthorizedException(t('errors.tooManyAttempts'));
    }

    await this.assertCaptcha(body.captchaToken);

    const user = await this.prisma.panelUser.findUnique({
      where: { email },
    });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new UnauthorizedException(t('errors.invalidCredentials'));
    }
    if (!user.isActive) throw new UnauthorizedException(t('errors.accountDisabled'));
    if (user.expiresAt && user.expiresAt < new Date()) {
      throw new UnauthorizedException('Votre compte a expiré.');
    }

    // 2FA : mot de passe correct mais pas encore de session — le client doit
    // repasser par /auth/login/2fa avec le code TOTP avant d'obtenir un vrai
    // JWT. `tempToken` est signé à part (type='2fa-pending', 5 min) : il ne
    // vaut rien pour appeler l'API tant qu'il n'a pas été échangé.
    if ((user as any).totpEnabled) {
      const tempToken = this.jwt.sign({ sub: user.id, type: '2fa-pending' }, { expiresIn: '5m' });
      return { status: 'success', requires2fa: true, tempToken };
    }

    return this.finishLogin(user, req, ip);
  }

  /** Deuxième étape du login quand le compte a la 2FA activée. */
  @Post('auth/login/2fa')
  async login2fa(@Body() body: Login2faDto, @Req() req: any) {
    const ip = this.clientIp(req);
    // Même esprit que le frein sur /auth/login : un code TOTP est un 6
    // chiffres, brute-forçable en un temps raisonnable sans limite de débit.
    if (!this.rateLimiter.check(`login2fa:ip:${ip}`, 10, 60_000)) {
      throw new UnauthorizedException(t('errors.tooManyAttempts'));
    }

    let payload: any;
    try {
      payload = this.jwt.verify(body.tempToken);
    } catch {
      throw new UnauthorizedException(t('errors.invalidCredentials'));
    }
    if (payload?.type !== '2fa-pending' || !payload?.sub) {
      throw new UnauthorizedException(t('errors.invalidCredentials'));
    }

    const user = await this.prisma.panelUser.findUnique({ where: { id: payload.sub } });
    const u = user as any;
    if (!user || !u.totpEnabled || !u.totpSecret) {
      throw new UnauthorizedException(t('errors.invalidCredentials'));
    }
    if (!user.isActive) throw new UnauthorizedException(t('errors.accountDisabled'));

    let usedRecoveryCode = false;
    const valid = authenticator.verify({ token: body.code, secret: u.totpSecret });
    if (!valid) {
      // Repli : `code` peut être un des codes de récupération à usage unique
      // (format "XXXX-XXXX") plutôt qu'un TOTP à 6 chiffres — utile quand
      // l'appareil TOTP est perdu.
      const updatedList = await consumeRecoveryCode(u.totpRecoveryCodes, body.code);
      if (!updatedList) throw new UnauthorizedException('Code 2FA invalide.');
      await this.prisma.panelUser.update({
        where: { id: user.id },
        data: { totpRecoveryCodes: updatedList } as any,
      });
      usedRecoveryCode = true;
    }

    return this.finishLogin(user, req, ip, usedRecoveryCode);
  }

  /** Émet la session + le JWT final — partagé entre login direct et validation 2FA. */
  private async finishLogin(
    user: { id: string; email: string; role: string; totpEnabled?: boolean },
    req: any,
    ip: string,
    usedRecoveryCode = false,
  ) {
    void this.mail.sendLoginNotification(user.email, this.settings.get('siteName'), ip);
    void this.auditService
      .log({ userId: user.id, userEmail: user.email, action: 'auth.login', ip })
      .catch(() => undefined);

    // Alerte nouvelle IP : avant d'insérer la session courante, pour ne pas
    // se comparer à elle-même. Best-effort (in-app + email si configuré),
    // jamais bloquant.
    const seenBefore = await this.prisma.activeSession.findFirst({ where: { userId: user.id, ip } });
    if (!seenBefore) {
      void this.notificationService.notifyNewLoginLocation(user.id, user.email, ip, req?.headers?.['user-agent']).catch(() => undefined);
    }
    if (usedRecoveryCode) {
      void this.notificationService.notifyRecoveryCodeUsed(user.id, user.email, ip).catch(() => undefined);
    }

    const token = this.sign(user);
    await this.createSession(user.id, token, req);

    const mustSetup2fa =
      user.role === 'ADMIN' && this.settings.getBool('require2faForAdmins') && !user.totpEnabled;

    return { status: 'success', token, user: { ...this.publicUser(user), mustSetup2fa } };
  }

  private async createSession(userId: string, token: string, req: any) {
    const userAgent = req?.headers?.['user-agent'] || null;
    const ip = this.clientIp(req);
    await this.prisma.activeSession.create({
      data: {
        userId,
        token,
        userAgent,
        ip,
      },
    });
  }

  /** Demande de réinitialisation de mot de passe — envoie un e-mail si SMTP configuré. */
  @Post('auth/forgot-password')
  async forgotPassword(@Body() body: ForgotPasswordDto, @Req() req: any) {
    if (!this.settings.getBool('emailResetEnabled')) {
      throw new ForbiddenException('Réinitialisation de mot de passe désactivée.');
    }
    if (!this.mail.isConfigured()) {
      throw new ForbiddenException('SMTP non configuré.');
    }
    // Même frein qu'au login : sans lui, un débit illimité permet de spammer
    // n'importe quelle boîte mail de réinitialisation.
    if (!this.rateLimiter.check(`forgot:ip:${this.clientIp(req)}`, 5, 60_000)) {
      throw new UnauthorizedException(t('errors.tooManyAttempts'));
    }

    await this.assertCaptcha(body.captchaToken);

    // Toujours répondre de la même façon (évite l'énumération d'e-mails).
    const user = body.email
      ? await this.prisma.panelUser.findUnique({ where: { email: body.email.toLowerCase() } })
      : null;

    if (user && user.isActive) {
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 3600_000); // 1 h
      await this.prisma.passwordResetToken.create({ data: { userId: user.id, token, expiresAt } });

      const host = this.settings.get('publicProxyHost');
      // On reconstruit l'URL du panel depuis l'hôte (sans le port proxy)
      const baseUrl = `https://${host}`;
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;
      void this.mail.sendPasswordReset(user.email, resetUrl, this.settings.get('siteName'));
    }

    return { status: 'success', message: 'Si un compte existe, un e-mail a été envoyé.' };
  }

  /** Réinitialise le mot de passe avec un token valide. */
  @Post('auth/reset-password')
  async resetPassword(
    @Body() body: ResetPasswordDto,
  ) {
    if (!this.settings.getBool('emailResetEnabled')) {
      throw new ForbiddenException('Réinitialisation de mot de passe désactivée.');
    }

    await this.assertCaptcha(body.captchaToken);

    if (!body.token || !body.password || body.password.length < 8) {
      throw new BadRequestException('Token et mot de passe (min 8 car.) requis.');
    }

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { token: body.token },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException(t('errors.tokenInvalid'));
    }

    await this.prisma.panelUser.update({
      where: { id: record.userId },
      data: { passwordHash: await bcrypt.hash(body.password, 10) },
    });

    await this.prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    return { status: 'success', message: 'Mot de passe réinitialisé.' };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('auth/me')
  async me(@CurrentUser() user: JwtUser) {
    const full = await this.prisma.panelUser.findUnique({ where: { id: user.id } });
    const mustSetup2fa =
      user.role === 'ADMIN' && this.settings.getBool('require2faForAdmins') && !(full as any)?.totpEnabled;
    return { status: 'success', user: { ...user, mustSetup2fa } };
  }

  /** Version applicative (footer du panel, vérification de déploiement). */
  @Get('version')
  version() {
    return {
      status: 'success',
      version: APP_VERSION,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async assertCaptcha(token?: string) {
    const provider = this.settings.get('captchaProvider') as CaptchaProvider;
    const secretKey = this.settings.get('captchaSecretKey');
    const ok = await verifyCaptcha(provider, secretKey, token, {
      siteKey: this.settings.get('captchaSiteKey'),
      capEndpoint: this.settings.get('captchaCapEndpoint'),
    });
    if (!ok) throw new BadRequestException('Vérification captcha échouée.');
  }

  private sign(u: { id: string; email: string; role: string }) {
    return this.jwt.sign({ sub: u.id, email: u.email, role: u.role });
  }

  private publicUser(u: { id: string; email: string; role: string }) {
    return { id: u.id, email: u.email, role: u.role };
  }
}
