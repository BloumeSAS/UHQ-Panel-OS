import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { authenticator } from '@otplib/preset-default';
import * as QRCode from 'qrcode';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../../database/prisma.service';
import { SettingsService } from '../../../config/settings.service';
import { TotpEnableDto, TotpVerifyDto } from '../../../common/dto/security.dto';

@ApiTags('panel-security')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/panel/security')
export class SecurityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

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

    await this.prisma.panelUser.update({
      where: { id: me.id },
      data: { totpEnabled: true } as any,
    });

    return { status: 'success', message: '2FA enabled' };
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
      data: { totpEnabled: false, totpSecret: null } as any,
    });

    return { status: 'success', message: '2FA disabled' };
  }

  /** Retourne le statut 2FA de l'utilisateur courant. */
  @Get('totp/status')
  async totpStatus(@CurrentUser() me: JwtUser) {
    const user = await this.prisma.panelUser.findUnique({ where: { id: me.id } });
    return { status: 'success', totpEnabled: (user as any)?.totpEnabled ?? false };
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
