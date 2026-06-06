import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PanelRole, ROLES_KEY } from '../decorators/roles.decorator';
import { JwtUser } from './jwt-auth.guard';
import { t } from '../utils/i18n';

/**
 * Vérifie que `req.user.role` figure parmi les rôles requis par la route.
 * Doit s'exécuter APRÈS JwtAuthGuard (qui pose req.user).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PanelRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const req = context.switchToHttp().getRequest<{ user?: JwtUser }>();
    if (!req.user || !required.includes(req.user.role)) {
      throw new ForbiddenException(
        `${t('errors.forbiddenRole')} : ${required.join(', ')}`,
      );
    }
    return true;
  }
}
