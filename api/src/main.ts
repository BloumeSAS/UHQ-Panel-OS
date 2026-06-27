import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WsAdapter } from '@nestjs/platform-ws';
import { join } from 'path';
import { AppModule } from './app.module';
import { ProxyServerService } from './modules/proxy-engine/proxy-server.service';
import { PrismaService } from './database/prisma.service';
import { RingBufferLogger } from './modules/logs/ring-buffer.logger';
import { applyDatabaseEnv } from './database/db-config';
import { translateValidationErrors } from './common/utils/i18n';

// Filet de sécurité : un incident isolé (ex. moteur Prisma d'un test de
// connexion DB) ne doit JAMAIS tuer le process et couper l'API.
process.on('unhandledRejection', (reason) => {
  Logger.error(`Unhandled promise rejection: ${reason}`, 'Process');
});
process.on('uncaughtException', (err) => {
  Logger.error(`Uncaught exception: ${err?.stack ?? err}`, 'Process');
});

async function bootstrap() {
  // Résout l'URL de base (env → fichier persistant → placeholder) AVANT que
  // Nest n'instancie PrismaClient. Démarre même sans base configurée.
  const db = applyDatabaseEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Logger custom : conserve les logs en mémoire pour le flux SSE du panel.
    logger: new RingBufferLogger(),
  });

  app.useWebSocketAdapter(new WsAdapter(app));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      exceptionFactory: (errors) => translateValidationErrors(errors),
    }),
  );
  app.useStaticAssets(join(__dirname, '..', 'static'), { prefix: '/static' });

  // Documentation Swagger — disponible sur /docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('UHQ Panel OS API')
    .setDescription('API du panel (JWT) + API legacy /api/v1 (Basic Auth).')
    .setVersion(process.env.npm_package_version ?? '2.0.0')
    .addBearerAuth()
    .addBasicAuth()
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'x-api-key')
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  (global as any).swaggerDocument = swaggerDocument;



  const apiPort = Number(process.env.API_PORT ?? 8000);
  await app.listen(apiPort, '0.0.0.0');
  Logger.log(`API listening on :${apiPort}`, 'Bootstrap');
  // Build marker — bump this string on every deploy you want to confirm is live.
  Logger.log('BUILD MARKER: panel-os-v2.0.18', 'Bootstrap');

  // Le moteur proxy TCP n'a de sens qu'avec une base connectée (auth des
  // sous-utilisateurs). On ne le démarre donc pas tant que la base n'est pas
  // configurée — l'assistant de configuration reste accessible.
  const prisma = app.get(PrismaService);
  if (db.configured && prisma.isConnected) {
    const proxyServer = app.get(ProxyServerService);
    await proxyServer.start();
  } else {
    Logger.warn(
      'Base de données non configurée — moteur proxy en pause. Ouvrez le panel pour terminer la configuration.',
      'Bootstrap',
    );
  }
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
