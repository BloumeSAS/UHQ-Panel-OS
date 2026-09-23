import { DynamicModule, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

import { I18nMiddleware } from './common/utils/i18n';

// --- Infra transverse -------------------------------------------------------
import { PrismaModule } from './database/prisma.module';
import { DatabaseModule } from './database/database.module';
import { SettingsModule } from './config/settings.module';
import { SecurityModule } from './common/security.module';
import { JobCoordinatorModule } from './common/job-coordinator.module';
import { RateLimiterModule } from './common/rate-limiter.module';
import { HealthController } from './common/health.controller';

// --- Modules métier (feature-based) -----------------------------------------
import { AuthModule } from './modules/auth/auth.module';
import { SettingsApiModule } from './modules/settings/settings.module';
import { UsersModule } from './modules/users/users.module';
import { ProxiesModule } from './modules/proxies/proxies.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { LogsModule } from './modules/logs/logs.module';
import { MeModule } from './modules/me/me.module';
import { AboutModule } from './modules/about/about.module';
import { TrafficModule } from './modules/traffic/traffic.module';
import { ProxyEngineModule } from './modules/proxy-engine/proxy-engine.module';
import { CheckerModule } from './modules/checker/checker.module';
import { ScraperModule } from './modules/scraper/scraper.module';
import { V1ApiModule } from './modules/legacy-api/v1.module';
import { MailModule } from './modules/mail/mail.module';
import { BackupModule } from './modules/backup/backup.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AddonsModule } from './modules/addons/addons.module';
import { AuditModule } from './modules/audit/audit.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { ProxyPoolsModule } from './modules/proxy-pools/proxy-pools.module';
import { BannedIpsModule } from './modules/banned-ips/banned-ips.module';
import { ExtensionsModule } from './modules/extensions/extensions.module';
import { EXTENSION_MODULES } from './modules/extensions/extension-modules';

/**
 * Localise le panel React buildé (web/dist). Ordre :
 *   1. WEB_DIST (override explicite)
 *   2. <runtime>/web/dist        (layout image Docker : web/dist copié à côté de dist/)
 *   3. <repo>/web/dist           (monorepo local : api/ et web/ frères)
 */
function resolveWebDist(): string {
  const candidates = [
    process.env.WEB_DIST,
    join(__dirname, '..', 'web', 'dist'),
    join(__dirname, '..', '..', 'web', 'dist'),
  ].filter(Boolean) as string[];
  return candidates.find((p) => existsSync(p)) ?? candidates[candidates.length - 1];
}

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // Infra
    PrismaModule,
    DatabaseModule,
    SettingsModule,
    SecurityModule,
    JobCoordinatorModule,
    RateLimiterModule,
    MailModule,
    BackupModule,
    NotificationsModule,
    AddonsModule,
    AuditModule,
    InvitationsModule,
    // Cœur métier
    TrafficModule,
    ProxyEngineModule,
    CheckerModule,
    ScraperModule,
    // API panel (JWT) + legacy (Basic Auth)
    AuthModule,
    SettingsApiModule,
    UsersModule,
    ProxiesModule,
    MonitoringModule,
    LogsModule,
    MeModule,
    AboutModule,
    V1ApiModule,
    ProxyPoolsModule,
    BannedIpsModule,
    ExtensionsModule,
    // Panel React statique (SPA). API, /docs, /static et /metrics (extension
    // prometheus-metrics, si active) exclus du fallback.
    ServeStaticModule.forRoot({
      rootPath: resolveWebDist(),
      exclude: ['/api/(.*)', '/docs', '/docs/(.*)', '/static/(.*)', '/metrics'],
      serveStaticOptions: { fallthrough: true },
    }),
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  /**
   * Point d'entrée réel utilisé par `main.ts` — `enabledExtensionKeys` est
   * résolu en DB AVANT `NestFactory.create` (une extension activée n'a
   * d'effet qu'au redémarrage suivant, cf. `ExtensionsService.setEnabled`).
   * Les modules d'extension activés sont ajoutés aux imports déjà déclarés
   * ci-dessus par le décorateur `@Module()` — NestJS fusionne les deux.
   */
  static forRoot(enabledExtensionKeys: string[]): DynamicModule {
    const extraImports = enabledExtensionKeys
      .map((key) => EXTENSION_MODULES[key])
      .filter((mod): mod is NonNullable<typeof mod> => !!mod);
    return {
      module: AppModule,
      imports: extraImports,
    };
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(I18nMiddleware).forRoutes('*');
  }
}
