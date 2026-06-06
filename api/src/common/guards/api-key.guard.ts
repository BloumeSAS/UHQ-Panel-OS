import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';
import { Reflector } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import { SettingsService } from '../../config/settings.service';
import { PrismaService } from '../../database/prisma.service';
import { SCOPES_KEY } from '../decorators/scopes.decorator';
import { t } from '../utils/i18n';

/**
 * Authentification de l'API legacy `/api/v1` par **clé API** (configurée et
 * régénérable depuis le panel). Deux formes acceptées :
 *   - en-tête `X-API-Key: <clé>`
 *   - Basic auth, mot de passe = `<clé>` (compat outils ; user ignoré)
 * Comparaison à temps constant. Si aucune clé n'est définie → accès refusé.
 * Supporte également les multi-clés API avec scopes et date d'expiration.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const provided = this.extractKey(req);
    if (!provided) {
      throw new UnauthorizedException(t('errors.apiKeyMissing'));
    }

    // Récupération des scopes requis sur le handler ou la classe
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 1. Clé d'administration globale (legacy)
    const expectedLegacy = this.settings.get('apiKey');
    if (expectedLegacy && safeEqual(provided, expectedLegacy)) {
      return true; // Accès total
    }

    // 2. Multi-clés API en base
    if (!provided.startsWith('uhq_') || provided.length < 12) {
      throw new UnauthorizedException(t('errors.apiKeyInvalid'));
    }
    const keyPrefix = provided.slice(0, 12);

    const keys = await this.prisma.apiKey.findMany({
      where: { keyPrefix, isActive: true },
    });

    let activeKey: any = null;
    for (const key of keys) {
      const match = await bcrypt.compare(provided, key.keyHash);
      if (match) {
        activeKey = key;
        break;
      }
    }

    if (!activeKey) {
      throw new UnauthorizedException(t('errors.apiKeyInvalid'));
    }

    // Vérification de l'expiration
    if (activeKey.expiresAt && activeKey.expiresAt < new Date()) {
      throw new UnauthorizedException('API key expired');
    }

    // Mise à jour asynchrone du dernier usage
    void this.prisma.apiKey
      .update({
        where: { id: activeKey.id },
        data: { lastUsed: new Date() },
      })
      .catch(() => {});

    // Vérification des scopes
    if (requiredScopes && requiredScopes.length > 0) {
      const keyScopes: string[] = JSON.parse(activeKey.scopes);
      const hasAllScopes = requiredScopes.every((scope) => keyScopes.includes(scope));
      if (!hasAllScopes) {
        throw new ForbiddenException('Insufficient API key permissions (scopes)');
      }
    }

    // Attache les informations à la requête
    (req as any).apiKey = activeKey;
    (req as any).user = { id: activeKey.userId, role: 'USER' };

    return true;
  }

  private extractKey(req: Request): string | null {
    const headerKey = req.headers['x-api-key'];
    if (typeof headerKey === 'string' && headerKey) return headerKey;

    const auth = req.headers['authorization'];
    if (auth?.startsWith('Basic ')) {
      try {
        const decoded = Buffer.from(auth.substring(6), 'base64').toString('utf8');
        const idx = decoded.indexOf(':');
        return idx === -1 ? decoded : decoded.substring(idx + 1);
      } catch {
        return null;
      }
    }
    if (auth?.startsWith('Bearer ')) return auth.substring(7);
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
