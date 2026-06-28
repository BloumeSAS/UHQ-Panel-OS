import { Controller, Get, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Response, Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../database/prisma.service';
import type { JwtUser } from '../../../common/guards/jwt-auth.guard';

/**
 * Controller gérant la documentation API dynamique.
 * Si l'utilisateur connecté est un ADMIN, il accède à toute la spec.
 * S'il est un simple USER, les routes d'administration sont masquées.
 * L'accès à /docs est protégé par token JWT passé en query parameter.
 * Si non authentifié, redirige vers /login.
 */
@Controller('docs')
export class DocsController {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Valide un JWT "à la main" (session active, compte actif et non expiré) —
   * cf. CLAUDE.md #8 : pas de guard ici, ces deux routes sont appelées sans
   * pouvoir poser d'en-tête Authorization (script Scalar embarqué, lien direct).
   */
  private async resolveUser(token: string): Promise<JwtUser | null> {
    if (!token) return null;
    try {
      const payload = await this.jwt.verifyAsync(token);
      const session = await this.prisma.activeSession.findUnique({ where: { token } });
      const user = await this.prisma.panelUser.findUnique({ where: { id: payload.sub } });
      if (!session || !user || !user.isActive) return null;
      if (user.expiresAt && user.expiresAt <= new Date()) return null;
      return { id: user.id, email: user.email, role: user.role as 'ADMIN' | 'USER' };
    } catch {
      return null;
    }
  }

  @Get()
  async renderDocs(@Req() req: Request, @Res() res: Response) {
    let token = '';
    const header = req.headers['authorization'];
    if (header && header.startsWith('Bearer ')) {
      token = header.substring(7);
    } else if (req.query && req.query.token) {
      token = req.query.token as string;
    }

    const user = await this.resolveUser(token);
    if (!user) {
      return res.redirect('/login');
    }

    res.setHeader('Content-Type', 'text/html');
    res.send(`
<!DOCTYPE html>
<html>
  <head>
    <title>UHQ Panel OS — Documentation API</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body {
        margin: 0;
        padding: 0;
      }
    </style>
  </head>
  <body>
    <div id="scalar-app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      Scalar.createApiReference(document.getElementById('scalar-app'), {
        spec: {
          url: '/docs/spec?token=${token}'
        },
        agent: {
          disabled: true
        },
        darkMode: true,
        theme: 'none',
        metaData: {
          title: 'UHQ Panel OS — API Docs',
          description: 'Documentation interactive de l\\'API UHQ Panel OS.',
          ogDescription: 'UHQ Panel OS API Reference',
          ogTitle: 'UHQ Panel OS — API Docs',
        },
        hiddenClients: ['unirest', 'restsharp', 'okhttp', 'clj_http', 'httpclient'],
        customCss: \`
          /* ── Polices ── */
          :root {
            --scalar-font: 'Inter', ui-sans-serif, system-ui, sans-serif;
            --scalar-font-code: 'JetBrains Mono', ui-monospace, monospace;
            --scalar-radius: 0.5rem;
            --scalar-radius-lg: 0.75rem;
          }

          /* ── Light ── */
          .light-mode {
            --scalar-color-1:      hsl(0,   0%,  20%);
            --scalar-color-2:      hsl(0,   0%,  45%);
            --scalar-color-3:      hsl(0,   0%,  55%);
            --scalar-color-accent: hsl(13, 73%,  54%);
            --scalar-background-1: hsl(0,   0%, 100%);
            --scalar-background-2: hsl(24,  30%, 95%);
            --scalar-background-3: hsl(24,  20%, 90%);
            --scalar-background-accent: hsla(13, 73%, 54%, 0.08);
            --scalar-border-color: hsl(24,  20%, 90%);
            --scalar-scrollbar-color: rgba(0,0,0,0.12);
            --scalar-scrollbar-color-active: hsl(13, 73%, 54%);
          }
          .light-mode .t-doc__sidebar {
            --scalar-sidebar-background-1: hsl(24, 30%, 97%);
            --scalar-sidebar-border-color:  hsl(24, 20%, 88%);
            --scalar-sidebar-color-1: hsl(0, 0%, 25%);
            --scalar-sidebar-item-hover-background: hsl(24, 50%, 90%);
            --scalar-sidebar-item-active-background: hsl(24, 30%, 94%);
          }

          /* ── Dark (défaut) ── */
          .dark-mode {
            --scalar-color-1:      hsl(0,   0%,  92%);
            --scalar-color-2:      hsl(0,   0%,  65%);
            --scalar-color-3:      hsl(0,   0%,  50%);
            --scalar-color-accent: hsl(13,  80%, 58%);
            --scalar-background-1: hsl(20,  14%,  8%);
            --scalar-background-2: hsl(20,  14%, 11%);
            --scalar-background-3: hsl(20,  10%, 18%);
            --scalar-background-accent: hsla(13, 80%, 58%, 0.10);
            --scalar-border-color: hsl(20,  10%, 20%);
            --scalar-scrollbar-color: rgba(255,255,255,0.08);
            --scalar-scrollbar-color-active: hsl(13, 80%, 58%);
          }
          .dark-mode .t-doc__sidebar {
            --scalar-sidebar-background-1: hsl(20, 14%, 9%);
            --scalar-sidebar-border-color:  hsl(20, 10%, 17%);
            --scalar-sidebar-color-1: hsl(0, 0%, 85%);
            --scalar-sidebar-color-2: hsl(0, 0%, 55%);
            --scalar-sidebar-item-hover-background: hsl(20, 12%, 20%);
            --scalar-sidebar-item-active-background: hsl(20, 10%, 16%);
            --scalar-sidebar-color-active: hsl(13, 80%, 58%);
          }

          /* ── Méthodes HTTP — couleurs vives sur fond sombre ── */
          .dark-mode .http-method--get    { background: hsla(200, 80%, 45%, 0.20); color: hsl(200, 85%, 65%); }
          .dark-mode .http-method--post   { background: hsla(130, 60%, 40%, 0.20); color: hsl(130, 65%, 55%); }
          .dark-mode .http-method--put    { background: hsla(40,  90%, 50%, 0.20); color: hsl(40,  90%, 65%); }
          .dark-mode .http-method--patch  { background: hsla(270, 60%, 55%, 0.20); color: hsl(270, 65%, 70%); }
          .dark-mode .http-method--delete { background: hsla(0,   70%, 50%, 0.20); color: hsl(0,   75%, 65%); }

          /* ── Supprime le badge "Scalar" ── */
          .powered-by-scalar { display: none !important; }
        \`
      });
    </script>
  </body>
</html>
    `);
  }

  @Get('spec')
  async getSpec(@Query('token') token: string) {
    const user = await this.resolveUser(token);
    if (!user) throw new UnauthorizedException();

    const spec = JSON.parse(JSON.stringify((global as any).swaggerDocument ?? {}));

    // Si simple utilisateur (USER), on filtre pour ne laisser que ce qui lui est accessible
    if (user.role !== 'ADMIN' && spec.paths) {
      const filteredPaths: any = {};
      const allowedPrefixes = [
        '/api/v1/me',
      ];
      for (const [path, val] of Object.entries(spec.paths)) {
        if (allowedPrefixes.some((prefix) => path.startsWith(prefix))) {
          filteredPaths[path] = val;
        }
      }
      spec.paths = filteredPaths;
    }

    return spec;
  }
}

