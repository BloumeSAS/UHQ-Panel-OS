import { SetMetadata } from '@nestjs/common';

export type PanelRole = 'ADMIN' | 'USER';
export const ROLES_KEY = 'roles';

/** Restreint une route aux rôles donnés. À combiner avec JwtAuthGuard + RolesGuard. */
export const Roles = (...roles: PanelRole[]) => SetMetadata(ROLES_KEY, roles);
