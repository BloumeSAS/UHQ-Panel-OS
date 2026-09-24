import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';

/**
 * À poser APRÈS ApiKeyGuard sur les routes `/api/v1/*` qui exposent des
 * données/actions globales (tous les comptes proxy, y compris identifiants
 * en clair) — jamais acceptable pour une clé auto-générée à portée réduite
 * (cf. /api/panel/api-keys, page "Clés API"). ApiKeyGuard n'attache
 * `req.user` QUE pour ces clés multi-scopes ; la clé maître (legacy,
 * `SettingsService.apiKey`) ne l'attache jamais. Donc : `req.user` présent
 * = clé à portée réduite = accès refusé ici. Le jeu de routes sûr pour ces
 * clés est `/api/v1/me/*` (filtré par ownerId).
 */
@Injectable()
export class MasterKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if ((req as any).user) {
      throw new ForbiddenException(
        "Cette route nécessite la clé API maître (admin) — une clé à portée réduite doit utiliser /api/v1/me/*.",
      );
    }
    return true;
  }
}
