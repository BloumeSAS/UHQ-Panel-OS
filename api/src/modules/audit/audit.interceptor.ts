import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { AUDITED_KEY } from './audited.decorator';
import { getClientIp } from '../../common/utils/client-ip';

/** Écrit une ligne d'audit pour chaque handler marqué `@Audited(...)` qui réussit. Une erreur d'écriture ne casse jamais la requête. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector, private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.get<string | undefined>(AUDITED_KEY, ctx.getHandler());
    if (!action) return next.handle();
    const req = ctx.switchToHttp().getRequest();
    return next.handle().pipe(
      tap(() => {
        const me = req.user;
        const p = req.params ?? {};
        const target = p.id ?? p.slug ?? p.filename ?? undefined;
        void this.audit
          .log({ userId: me?.id, userEmail: me?.email, action, target: target ? String(target).slice(0, 200) : undefined, ip: getClientIp(req) })
          .catch(() => undefined);
      }),
    );
  }
}
