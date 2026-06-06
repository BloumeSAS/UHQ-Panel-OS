import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from '../../config/settings.service';
import { MailService } from '../mail/mail.service';
import { CreateInvitationDto, AcceptInvitationDto } from '../../common/dto/security.dto';
import { JwtService } from '@nestjs/jwt';

@ApiTags('panel-invitations')
@Controller('api/panel/invitations')
export class InvitationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
    private readonly jwt: JwtService,
  ) {}

  /** ADMIN: envoie une invitation par e-mail. */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post()
  async invite(@Body() dto: CreateInvitationDto, @CurrentUser() me: JwtUser) {
    if (!this.mail.isConfigured()) {
      throw new ForbiddenException('SMTP not configured — cannot send invitation emails');
    }
    if (!this.settings.getBool('invitationsEnabled')) {
      throw new ForbiddenException('Invitations not enabled in settings');
    }

    // Vérifier si un compte existe déjà
    const existing = await this.prisma.panelUser.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) throw new BadRequestException('An account already exists for this email');

    // Créer l'invitation
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600_000); // 7 jours
    await this.prisma.invitation.create({
      data: {
        email: dto.email.toLowerCase(),
        token,
        role: dto.role ?? 'USER',
        expiresAt,
      },
    });

    const host = this.settings.get('publicProxyHost');
    const baseUrl = `https://${host}`;
    const inviteUrl = `${baseUrl}/register?invite=${token}`;

    await this.mail.sendInvitation(dto.email, inviteUrl, this.settings.get('siteName'));

    return { status: 'success', message: `Invitation sent to ${dto.email}` };
  }

  /** ADMIN: liste les invitations en attente. */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get()
  async list() {
    const invitations = await this.prisma.invitation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { status: 'success', data: invitations };
  }

  /** PUBLIC: vérifier un token d'invitation. */
  @Get('check')
  async check(@Query('token') token: string) {
    if (!token) throw new BadRequestException('Token required');
    const inv = await this.prisma.invitation.findUnique({ where: { token } });
    if (!inv || inv.usedAt || inv.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired invitation token');
    }
    return { status: 'success', email: inv.email };
  }

  /** PUBLIC: accepter une invitation et créer le compte. */
  @Post('accept')
  async accept(@Body() dto: AcceptInvitationDto) {
    const inv = await this.prisma.invitation.findUnique({ where: { token: dto.token } });
    if (!inv || inv.usedAt || inv.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired invitation token');
    }

    const exists = await this.prisma.panelUser.findUnique({
      where: { email: inv.email },
    });
    if (exists) throw new BadRequestException('Account already exists');

    const user = await this.prisma.panelUser.create({
      data: {
        email: inv.email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: inv.role,
      },
    });

    await this.prisma.invitation.update({
      where: { id: inv.id },
      data: { usedAt: new Date() },
    });

    const token = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return {
      status: 'success',
      token,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }
}
