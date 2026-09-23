import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as http from 'http';
import { loadOfficialAddons, OfficialAddonEntry } from './official-addons-registry';

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
  private readonly logger = new Logger(AddonProxyMiddleware.name);

  use(req: Request, res: Response, next: NextFunction): void {
    const direct = /^\/addon-proxy\/([a-z0-9-]+)(\/.*)?$/i.exec(req.path);
    if (direct) {
      const slug = direct[1];
      const entry = this.lookup(slug);
      if (!entry) {
        res.status(404).json({ status: 'error', message: `Addon "${slug}" introuvable ou non embarqué dans cette image.` });
        return;
      }
      const prefix = `/addon-proxy/${slug}`;
      const targetPath = (req.url.startsWith(prefix) ? req.url.slice(prefix.length) : req.url) || '/';
      this.forward(req, res, entry, targetPath);
      return;
    }

    // Repli : les addons officiels sont conçus pour être servis à la
    // racine de leur propre domaine (déploiement externe classique) — leur
    // JS appelle donc l'API en chemin absolu (ex. `fetch('/api/x')`, voir
    // UHQ-Addon-Wallet/web/src/lib/api.ts). Une fois embarqué et servi sous
    // /addon-proxy/<slug>/, ce chemin absolu ne passe JAMAIS par le préfixe
    // ci-dessus — la requête atterrit directement à la racine DU PANEL.
    // On retrouve l'addon d'origine via `Referer` (même origine : la page
    // qui a émis la requête est forcément /addon-proxy/<slug>/...) et on
    // la proxifie quand même, sans toucher au code de l'addon.
    const referer = req.headers.referer;
    const refSlug = referer && this.slugFromPath(this.safePathname(referer));
    if (refSlug) {
      const entry = this.lookup(refSlug);
      if (entry) {
        this.forward(req, res, entry, req.url);
        return;
      }
    }

    next();
  }

  private lookup(slug: string): OfficialAddonEntry | undefined {
    const entry = loadOfficialAddons().find((e) => e.slug === slug);
    return entry?.bundlePort ? entry : undefined;
  }

  private slugFromPath(pathname: string): string | null {
    const m = /^\/addon-proxy\/([a-z0-9-]+)\//i.exec(pathname);
    return m ? m[1] : null;
  }

  private safePathname(url: string): string {
    try {
      return new URL(url).pathname;
    } catch {
      return '';
    }
  }

  private forward(req: Request, res: Response, entry: OfficialAddonEntry, targetPath: string): void {
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
    proxyReq.on('error', (e) => {
      this.logger.warn(`Addon "${entry.slug}" injoignable sur 127.0.0.1:${entry.bundlePort} : ${e.message}`);
      if (!res.headersSent) {
        res.status(502).json({ status: 'error', message: `Addon "${entry.slug}" injoignable (pas démarré ?).` });
      }
    });
    req.pipe(proxyReq);
  }
}
