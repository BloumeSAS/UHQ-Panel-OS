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
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { authenticator } from '@otplib/preset-default';
import * as QRCode from 'qrcode';
import * as bcrypt from 'bcryptjs';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../../database/prisma.service';
import { SettingsService } from '../../../config/settings.service';
import { AuditService } from '../../audit/audit.service';
import { TotpEnableDto, TotpVerifyDto, ChangePasswordDto } from '../../../common/dto/security.dto';
import { generateRecoveryCodes, hashRecoveryCodes } from '../../../common/utils/recovery-codes';

@ApiTags('panel-security')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/panel/security')
export class SecurityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly auditService: AuditService,
  ) {}

  // ── Profil ───────────────────────────────────────────────────────────────────

  /** Infos du compte panel courant (email, rôle) — utilisé par la page Profil. */
  @Get('me')
  async me(@CurrentUser() me: JwtUser) {
    const user = await this.prisma.panelUser.findUnique({ where: { id: me.id } });
    if (!user) throw new NotFoundException('User not found');
    return {
      status: 'success',
      data: { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt },
    };
  }

  /** Change le mot de passe du compte courant (nécessite l'ancien). */
  @Patch('password')
  async changePassword(@CurrentUser() me: JwtUser, @Body() dto: ChangePasswordDto) {
    const user = await this.prisma.panelUser.findUnique({ where: { id: me.id } });
    if (!user) throw new NotFoundException('User not found');
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Mot de passe actuel incorrect');

    await this.prisma.panelUser.update({
      where: { id: me.id },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) },
    });
    await this.auditService.log({
      userId: me.id,
      userEmail: me.email,
      action: 'auth.password-change',
    });
    return { status: 'success', message: 'Password updated' };
  }

  // ── 2FA / TOTP ───────────────────────────────────────────────────────────────

  /** Génère un secret TOTP et retourne le QR code (étape 1). */
  @Post('totp/setup')
  async totpSetup(@CurrentUser() me: JwtUser) {
    const secret = authenticator.generateSecret();
    const siteName = this.settings.get('siteName') || 'UHQ Panel';
    const user = await this.prisma.panelUser.findUnique({ where: { id: me.id } });
    if (!user) throw new NotFoundException('User not found');
    if ((user as any).totpEnabled) throw new BadRequestException('2FA already enabled');

    await this.prisma.panelUser.update({
      where: { id: me.id },
      data: { totpSecret: secret } as any,
    });

    const otpauth = authenticator.keyuri(user.email, siteName, secret);
    const qrCode = await QRCode.toDataURL(otpauth);

    return { status: 'success', secret, qrCode, otpauth };
  }

  /** Vérifie le code TOTP et active définitivement le 2FA. */
  @Post('totp/enable')
  async totpEnable(@CurrentUser() me: JwtUser, @Body() dto: TotpEnableDto) {
    const user = await this.prisma.panelUser.findUnique({ where: { id: me.id } });
    const u = user as any;
    if (!u?.totpSecret) throw new BadRequestException('Run /totp/setup first');
    if (u.totpEnabled) throw new BadRequestException('2FA already enabled');

    const valid = authenticator.verify({ token: dto.token, secret: u.totpSecret });
    if (!valid) throw new BadRequestException('Invalid TOTP code');

    // Codes de récupération générés une seule fois ici, à l'activation —
    // affichés en clair dans la réponse (jamais récupérables ensuite, seul
    // leur hash est stocké). Perdre son appareil TOTP sans les avoir notés
    // = compte bloqué sans recours DB direct, d'où leur existence.
    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.panelUser.update({
      where: { id: me.id },
      data: { totpEnabled: true, totpRecoveryCodes: await hashRecoveryCodes(recoveryCodes) } as any,
    });
    await this.auditService.log({ userId: me.id, userEmail: me.email, action: 'auth.2fa-enable' });

    return { status: 'success', message: '2FA enabled', recoveryCodes };
  }

  /** Régénère les codes de récupération (invalide les anciens) — nécessite le code TOTP actuel. */
  @Post('totp/recovery-codes/regenerate')
  async regenerateRecoveryCodes(@CurrentUser() me: JwtUser, @Body() dto: TotpVerifyDto) {
    const user = await this.prisma.panelUser.findUnique({ where: { id: me.id } });
    const u = user as any;
    if (!u?.totpEnabled) throw new BadRequestException('2FA not enabled');

    const valid = authenticator.verify({ token: dto.token, secret: u.totpSecret! });
    if (!valid) throw new BadRequestException('Invalid TOTP code');

    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.panelUser.update({
      where: { id: me.id },
      data: { totpRecoveryCodes: await hashRecoveryCodes(recoveryCodes) } as any,
    });
    await this.auditService.log({ userId: me.id, userEmail: me.email, action: 'auth.2fa-recovery-codes-regenerate' });

    return { status: 'success', recoveryCodes };
  }

  /** Désactive le 2FA après vérification du code actuel. */
  @Post('totp/disable')
  async totpDisable(@CurrentUser() me: JwtUser, @Body() dto: TotpVerifyDto) {
    const user = await this.prisma.panelUser.findUnique({ where: { id: me.id } });
    const u = user as any;
    if (!u?.totpEnabled) throw new BadRequestException('2FA not enabled');

    const valid = authenticator.verify({ token: dto.token, secret: u.totpSecret! });
    if (!valid) throw new BadRequestException('Invalid TOTP code');

    await this.prisma.panelUser.update({
      where: { id: me.id },
      data: { totpEnabled: false, totpSecret: null, totpRecoveryCodes: null } as any,
    });
    await this.auditService.log({ userId: me.id, userEmail: me.email, action: 'auth.2fa-disable' });

    return { status: 'success', message: '2FA disabled' };
  }

  /** Retourne le statut 2FA de l'utilisateur courant (+ nb de codes de récupération restants). */
  @Get('totp/status')
  async totpStatus(@CurrentUser() me: JwtUser) {
    const user = await this.prisma.panelUser.findUnique({ where: { id: me.id } });
    const u = user as any;
    let recoveryCodesRemaining = 0;
    if (u?.totpRecoveryCodes) {
      try {
        recoveryCodesRemaining = JSON.parse(u.totpRecoveryCodes).length;
      } catch {
        /* ignore */
      }
    }
    return { status: 'success', totpEnabled: u?.totpEnabled ?? false, recoveryCodesRemaining };
  }

  // ── Sessions ─────────────────────────────────────────────────────────────────

  /** Liste les sessions actives de l'utilisateur courant. */
  @Get('sessions')
  async listSessions(@CurrentUser() me: JwtUser) {
    const sessions = await this.prisma.activeSession.findMany({
      where: { userId: me.id },
      orderBy: { lastSeen: 'desc' },
    });
    return {
      status: 'success',
      data: sessions.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        ip: s.ip,
        createdAt: s.createdAt,
        lastSeen: s.lastSeen,
      })),
    };
  }

  /** Force la déconnexion d'une session par son ID. */
  @Delete('sessions/:id')
  async revokeSession(@CurrentUser() me: JwtUser, @Param('id') id: string) {
    const session = await this.prisma.activeSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== me.id) throw new BadRequestException('Not your session');
    await this.prisma.activeSession.delete({ where: { id } });
    return { status: 'success' };
  }

  /** Force la déconnexion de toutes les autres sessions. */
  @Delete('sessions')
  async revokeAllSessions(@CurrentUser() me: JwtUser, @Req() req: any) {
    const authHeader = req.headers?.authorization || '';
    const currentToken = authHeader.replace('Bearer ', '');
    await this.prisma.activeSession.deleteMany({
      where: { userId: me.id, token: { not: currentToken } },
    });
    return { status: 'success' };
  }
}
