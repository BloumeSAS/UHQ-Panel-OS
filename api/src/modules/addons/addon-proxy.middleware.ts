import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as http from 'http';
import { loadOfficialAddons } from './official-addons-registry';

/**
 * Reverse-proxy interne `/addon-proxy/:slug/*` → `http://127.0.0.1:<bundlePort>/*`
 * pour les addons officiels embarqués (cf. BundledAddonsService). Le
 * navigateur charge l'UI de l'addon (iframe) via ce chemin — même origine
 * que le panel, à travers le port 8000 déjà exposé — plutôt que de taper
 * directement un port interne jamais publié.
 *
 * Streaming brut (pas de buffering, `bodyParser: false` sur toute l'app —
 * voir main.ts) : fonctionne pour le SPA de l'addon comme pour ses appels
 * API (JSON, upload...). Pas d'authentification imposée ici : chaque addon
 * gère la sienne via le JWT transmis en query string (même mécanisme que
 * les addons externes, cf. `AddonIframe.tsx` → `passJwt`).
 */
@Injectable()
export class AddonProxyMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const match = /^\/addon-proxy\/([a-z0-9-]+)(\/.*)?$/i.exec(req.path);
    if (!match) return next();

    const slug = match[1];
    const entry = loadOfficialAddons().find((e) => e.slug === slug);
    if (!entry?.bundlePort) {
      res.status(404).json({ status: 'error', message: `Addon "${slug}" introuvable ou non embarqué dans cette image.` });
      return;
    }

    const prefix = `/addon-proxy/${slug}`;
    const targetPath = (req.url.startsWith(prefix) ? req.url.slice(prefix.length) : req.url) || '/';

    const proxyReq = http.request(
      {
        host: '127.0.0.1',
        port: entry.bundlePort,
        method: req.method,
        path: targetPath,
        headers: { ...req.headers, host: `127.0.0.1:${entry.bundlePort}` },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on('error', () => {
      if (!res.headersSent) {
        res.status(502).json({ status: 'error', message: `Addon "${slug}" injoignable (pas démarré ?).` });
      }
    });
    req.pipe(proxyReq);
  }
}
