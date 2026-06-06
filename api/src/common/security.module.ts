import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { MaintenanceGuard } from './guards/maintenance.guard';
import { SettingsModule } from '../config/settings.module';
import { ensureJwtSecret } from '../database/db-config';

/**
 * Fournit JwtModule + guards à toute l'app.
 * Le secret JWT est auto-généré au premier boot et persisté dans runtime.json
 * — aucune variable d'env requise.
 */
@Global()
@Module({
  imports: [
    SettingsModule,
    JwtModule.register({
      global: true,
      secret: ensureJwtSecret(),
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
