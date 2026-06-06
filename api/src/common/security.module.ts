import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { MaintenanceGuard } from './guards/maintenance.guard';
import { SettingsModule } from '../config/settings.module';

/**
 * Fournit JwtModule + guards à toute l'app. Le secret JWT vient de
 * `JWT_SECRET` (à défaut `ADMIN_PASSWORD`, puis un repli de dev).
 */
@Global()
@Module({
  imports: [
    SettingsModule,
    JwtModule.register({
      global: true,
      secret:
        process.env.JWT_SECRET ||
        process.env.ADMIN_PASSWORD ||
        'uhq-panel-os-dev-secret-change-me',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [
    JwtAuthGuard,
    RolesGuard,
    {
      provide: APP_GUARD,
      useClass: MaintenanceGuard,
    },
  ],
  exports: [JwtModule, JwtAuthGuard, RolesGuard],
})
export class SecurityModule {}
