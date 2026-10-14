import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { getSetupToken } from '../utils/setup-token';

/**
 * Protection de l'installation : tant que l'installation n'est pas terminée, les routes /setup
 * (création du 1er admin, configuration de la base, restauration) exigent le jeton d'installation
 * (en-tête `x-setup-token`). Le jeton est généré automatiquement et affiché dans les logs
 * (cf. common/utils/setup-token.ts). Aucune protection sur une installation déjà terminée.
 */
@Injectable()
export class SetupTokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = getSetupToken();
    if (!expected) return true;
    const req = ctx.switchToHttp().getRequest();
    const given = String(req.headers['x-setup-token'] ?? '').trim();
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
    throw new UnauthorizedException('SETUP_TOKEN_REQUIRED');
  }
}

export { setupTokenRequired } from '../utils/setup-token';
