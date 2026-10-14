import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

/**
 * Protection OPTIONNELLE de l'installation : si la variable d'environnement
 * `SETUP_TOKEN` est définie, les routes d'installation (création du 1er admin,
 * configuration de la base, restauration) exigent ce jeton dans l'en-tête
 * `x-setup-token`. Évite qu'un tiers qui trouve le panel fraîchement déployé
 * devienne administrateur avant vous. Sans variable : comportement inchangé.
 */
@Injectable()
export class SetupTokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.SETUP_TOKEN;
    if (!expected) return true;
    const req = ctx.switchToHttp().getRequest();
    const given = String(req.headers['x-setup-token'] ?? '');
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
    throw new UnauthorizedException('SETUP_TOKEN_REQUIRED');
  }
}

export const setupTokenRequired = () => !!process.env.SETUP_TOKEN;
