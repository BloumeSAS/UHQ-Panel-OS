import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SettingsService } from '../../config/settings.service';

@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(
    private readonly settings: SettingsService,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isMaintenance = this.settings.getBool('maintenanceModeEnabled');
    if (!isMaintenance) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const url = request.url;

    // 1. Allow all non-API requests (so static assets and SPA pages load)
    if (!url.startsWith('/api') && url !== '/health') {
      return true;
    }

    // 2. Public endpoints that MUST bypass maintenance mode
    if (
      url.includes('/setup/status') ||
      url.includes('/setup/db-status') ||
      url.includes('/auth/login') ||
      url.includes('/auth/forgot-password') ||
      url.includes('/auth/reset-password') ||
      url.endsWith('/health') ||
      url.includes('/api/health')
    ) {
      return true;
    }

    // 3. Authenticated administrators (ADMIN role) are allowed
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = this.jwt.verify(token);
        if (decoded && decoded.role === 'ADMIN') {
          return true;
        }
      } catch (err) {
        // Token verification failed, treat as guest/non-admin
      }
    }

    // 4. Deny access for everyone else with a Service Unavailable status
    throw new ServiceUnavailableException('Maintenance mode is active.');
  }
}
