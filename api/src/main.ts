import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WsAdapter } from '@nestjs/platform-ws';
import helmet from 'helmet';
import { randomBytes } from 'crypto';
import { json, urlencoded } from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import { ProxyServerService } from './modules/proxy-engine/proxy-server.service';
import { BundledAddonsService } from './modules/addons/bundled-addons.service';
import { AddonProxyMiddleware } from './modules/addons/addon-proxy.middleware';
import { PrismaService } from './database/prisma.service';
import { TrafficService } from './modules/traffic/traffic.service';
import { RingBufferLogger } from './modules/logs/ring-buffer.logger';
import { applyDatabaseEnv } from './database/db-config';
import { translateValidationErrors } from './common/utils/i18n';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';

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
    bodyParser: false,
  });

  // Un seul hop de confiance : Traefik/Coolify devant l'API (cf. CLAUDE.md,
  // seul le port 8000 est exposé). Sans ce réglage, `X-Forwarded-For` est un
  // simple header client — n'importe qui peut l'envoyer pour usurper une IP
  // (contournement du rate-limit login/forgot-password par ex.). Avec
  // `trust proxy` à 1, Express calcule `req.ip` en ne faisant confiance qu'au
  // DERNIER hop ajouté par le reverse proxy réel, en ignorant toute valeur
  // que le client aurait tenté d'injecter en amont dans la chaîne.
  app.set('trust proxy', 1);

  // Nonce CSP par requête — permet au SEUL inline <script> du panel (le
  // bootstrap Scalar sur /docs, cf. DocsController) de passer sans avoir à
  // ouvrir script-src à 'unsafe-inline' pour tout le site. `res.locals.cspNonce`
  // est lu par DocsController pour poser l'attribut `nonce` sur son <script>.
  app.use((req: any, res: any, next: any) => {
    res.locals.cspNonce = randomBytes(16).toString('base64');
    next();
  });

  // En-têtes de sécurité HTTP (X-Frame-Options, X-Content-Type-Options,
  // Referrer-Policy, COOP/CORP, CSP, Permissions-Policy…) — absents jusqu'ici
  // (signalé par un scan nuclei, tous en sévérité "info" : pas d'exploitation
  // directe, mais de la défense en profondeur qui manquait). CSP construite
  // à la main (pas les défauts helmet) pour coller aux besoins réels du panel :
  //   - script-src : nonce par requête pour /docs (au lieu de 'unsafe-inline'
  //     global) ; cdn.jsdelivr.net pour le script Scalar lui-même.
  //   - style-src : 'unsafe-inline' requis par les innombrables `style={{}}`
  //     React du panel (pas de nonce possible sur un attribut `style=""`,
  //     seulement sur des balises `<style>` — pas de refonte réaliste ici).
  //   - connect-src / frame-src : domaines des providers captcha (CAP,
  //     hCaptcha, reCAPTCHA, Turnstile) — un CAP auto-hébergé ailleurs que
  //     cap.trycap.dev devra élargir `connect-src` ici.
  //   - img-src : flagcdn.com (drapeaux pays, Pool/Analytics).
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            'https://cdn.jsdelivr.net',
            (req: any, res: any) => `'nonce-${res.locals.cspNonce}'`,
          ],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
          imgSrc: ["'self'", 'data:', 'https://flagcdn.com', 'https://cdn.jsdelivr.net'],
          fontSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net'],
          connectSrc: [
            "'self'",
            'https://cdn.jsdelivr.net',
            'https://cap.trycap.dev',
            'https://hcaptcha.com',
            'https://*.hcaptcha.com',
            'https://www.google.com',
            'https://challenges.cloudflare.com',
          ],
          frameSrc: [
            "'self'",
            'https://www.google.com',
            'https://challenges.cloudflare.com',
            'https://*.hcaptcha.com',
          ],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'self'"],
        },
      },
      // `credentialless` plutôt que désactivé/`require-corp` : isole quand
      // même le panel (protection Spectre-style) sans exiger que chaque
      // ressource cross-origin (script Scalar sur jsdelivr, captcha…) pose
      // elle-même un en-tête CORP — `require-corp` cassait ces chargements.
      crossOriginEmbedderPolicy: { policy: 'credentialless' },
      // `strict-origin-when-cross-origin` plutôt que le défaut helmet
      // `no-referrer` : les addons officiels embarqués (Wallet, Orders)
      // appellent leur propre API en chemin absolu (`fetch('/api/x')`,
      // conçus pour un déploiement externe classique) — AddonProxyMiddleware
      // les route correctement UNIQUEMENT via l'en-tête Referer (même
      // origine, cf. addon-proxy.middleware.ts). `no-referrer` supprimait ce
      // header pour TOUTE requête, y compris ces appels same-origin, cassant
      // silencieusement les addons embarqués ("Cannot GET /api/...").
      // `strict-origin-when-cross-origin` envoie l'URL complète en same-origin
      // (ce dont le proxy a besoin) et seulement l'origine en cross-origin —
      // c'est aussi la valeur par défaut moderne des navigateurs.
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Permissions-Policy — hors périmètre des defaults helmet (qui ne pose que
  // Cross-Origin-*), posé à la main. Désactive les API sensibles qu'aucune
  // page du panel n'utilise.
  app.use((req: any, res: any, next: any) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), interest-cohort=()',
    );
    next();
  });

  // Reverse-proxy des addons officiels embarqués — DOIT être monté AVANT
  // les body-parsers ci-dessous : il faut le flux brut de la requête pour le
  // streamer tel quel vers le process interne (upload, JSON, peu importe),
  // sinon express.json()/urlencoded() le consommerait en premier et
  // `req.pipe(proxyReq)` recevrait un stream déjà vidé.
  //
  // Monté ici (Express natif, `app.use()`) et PAS via NestJS
  // `MiddlewareConsumer`/`AppModule.configure()` : testé en local, un
  // NestMiddleware appliqué via `consumer.apply(...).forRoutes(...)` n'était
  // jamais invoqué pour cette route (confirmé par des logs qui ne
  // s'affichaient jamais), cause exacte non identifiée — cette approche
  // directe, elle, fonctionne de façon vérifiée.
  const addonProxy = new AddonProxyMiddleware();
  app.use((req: any, res: any, next: any) => addonProxy.use(req, res, next));

  // Body-parser par défaut de Nest = 100kb → "entity too large" dès qu'on
  // importe une grosse liste de proxies manuellement depuis le panel.
  app.use(json({ limit: '25mb' }));
  app.use(urlencoded({ extended: true, limit: '25mb' }));

  app.useWebSocketAdapter(new WsAdapter(app));
  // ID de corrélation par requête (repris de X-Request-Id si fourni, sinon
  // généré) — propagé via AsyncLocalStorage et inclus dans chaque ligne de
  // log émise pendant la durée de vie de la requête (cf. RingBufferLogger).
  app.useGlobalInterceptors(new RequestIdInterceptor());
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



  // SIGTERM (redeploy, `docker stop`) → `app.close()` déclenche les hooks
  // Nest : le moteur coupe ses tunnels (onModuleDestroy) puis TrafficService
  // écrit le trafic encore en mémoire (beforeApplicationShutdown). Sans ça,
  // jusqu'à 5s de trafic de tous les comptes étaient perdus à chaque
  // redémarrage. Handler maison plutôt que `enableShutdownHooks()` : ce
  // dernier se ré-envoie le signal pour sortir, signal qu'un node PID 1
  // (conteneur) ignore — l'arrêt attendait alors le SIGKILL de Docker.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    Logger.log(`${signal} received — graceful shutdown`, 'Bootstrap');
    // Filet : toujours sortir avant le SIGKILL de Docker (10s par défaut).
    setTimeout(() => process.exit(1), 8000).unref();
    app
      .close()
      .catch((e) => Logger.error(`Shutdown error: ${e}`, 'Bootstrap'))
      .finally(() => process.exit(0));
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  const apiPort = Number(process.env.API_PORT ?? 8000);
  await app.listen(apiPort, '0.0.0.0');
  Logger.log(`API listening on :${apiPort}`, 'Bootstrap');
  // Build marker — bump this string on every deploy you want to confirm is live.
  Logger.log('BUILD MARKER: panel-os-v2.4.67', 'Bootstrap');

  // Le moteur proxy TCP n'a de sens qu'avec une base connectée (auth des
  // sous-utilisateurs). On ne le démarre donc pas tant que la base n'est pas
  // configurée — l'assistant de configuration reste accessible.
  const prisma = app.get(PrismaService);
  if (db.configured && prisma.isConnected) {
    // Conversion unique Gio → Go décimal AVANT tout trafic (cf. TrafficService).
    try {
      await app.get(TrafficService).ensureDecimalUnits();
    } catch (e) {
      Logger.error(`Conversion des unités de trafic échouée : ${e}`, 'Bootstrap');
    }
    const proxyServer = app.get(ProxyServerService);
    await proxyServer.start();

    // Relance les addons officiels embarqués qui étaient activés avant ce
    // redémarrage (cf. BundledAddonsService) — non-bloquant, ne doit jamais
    // empêcher le panel lui-même de démarrer.
    app.get(BundledAddonsService)
      .restoreOnBoot()
      .catch((e) => Logger.error(`Échec de la relance des addons embarqués : ${e}`, 'Bootstrap'));
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
