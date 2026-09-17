import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { randomUUID } from 'crypto';
import { requestIdStorage } from '../utils/request-context';

/**
 * Génère (ou reprend, si un client/reverse-proxy en amont en fournit un via
 * `X-Request-Id`) un ID de corrélation par requête, propagé pendant toute sa
 * durée de vie via AsyncLocalStorage (`requestIdStorage`). `RingBufferLogger`
 * l'inclut dans chaque ligne de log émise pendant ce temps — avant, il était
 * impossible de relier plusieurs lignes de log à une même requête HTTP.
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    if (!req) return next.handle();

    const incoming = req.headers?.['x-request-id'];
    const id = typeof incoming === 'string' && incoming.trim() ? incoming.trim().slice(0, 64) : randomUUID();
    try {
      context.switchToHttp().getResponse()?.setHeader?.('X-Request-Id', id);
    } catch {
      /* pas de réponse HTTP dans ce contexte (WS, etc.) — pas bloquant */
    }

    return new Observable((subscriber) => {
      requestIdStorage.run(id, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
