import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { t } from '../utils/i18n';

export interface JwtUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
}

/**
 * Vérifie le Bearer JWT, recharge le PanelUser en base (rejette si désactivé
 * ou supprimé) et attache `req.user`. Utilisé par tout `/api/panel/*` protégé.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: JwtUser }>();
    const header = req.headers['authorization'];
    let token = '';
    if (header && header.startsWith('Bearer ')) {
      token = header.substring(7);
    } else if (req.query && req.query.token) {
      token = req.query.token as string;
    }

    if (!token) {
      throw new UnauthorizedException(t('errors.tokenMissing'));
    }
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException(t('errors.tokenInvalid'));
    }

    // Vérifie si la session est active en base de données
    const session = await this.prisma.activeSession.findUnique({ where: { token } });
    if (!session) {
      throw new UnauthorizedException('Session révoquée.');
    }

    const user = await this.prisma.panelUser.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException(t('errors.accountMissing'));
    }

    if (user.expiresAt && user.expiresAt < new Date()) {
      throw new UnauthorizedException('Compte expiré.');
    }

    // Met à jour la date de dernière activité asynchronement
    void this.prisma.activeSession
      .update({
        where: { id: session.id },
        data: { lastSeen: new Date() },
      })
      .catch(() => {});

    req.user = { id: user.id, email: user.email, role: user.role as 'ADMIN' | 'USER' };
    return true;
  }
}
