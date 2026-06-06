import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtUser } from '../guards/jwt-auth.guard';

/** Injecte le PanelUser courant (posé par JwtAuthGuard) dans un handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
