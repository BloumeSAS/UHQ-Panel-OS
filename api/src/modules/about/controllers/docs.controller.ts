import { Controller, Get, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Response, Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../database/prisma.service';
import { SettingsService } from '../../../config/settings.service';
import type { JwtUser } from '../../../common/guards/jwt-auth.guard';

type ThemeColors = { light?: Record<string, string>; dark?: Record<string, string> };

/**
 * Palette tangerine par défaut (identique à web/src/index.css) — utilisée
 * quand l'admin n'a pas customisé le thème (Paramètres → Thème).
 */
const DEFAULT_LIGHT: Record<string, string> = {
  background: '0 0% 100%', foreground: '0 0% 20%', 'muted-foreground': '0 0% 45%',
  primary: '13 73% 54%', border: '24 20% 90%', secondary: '24 30% 95%',
  sidebar: '24 30% 97%', 'sidebar-foreground': '0 0% 25%',
  'sidebar-accent': '24 50% 90%', 'sidebar-border': '24 20% 88%',
};
const DEFAULT_DARK: Record<string, string> = {
  background: '20 14% 8%', foreground: '0 0% 92%', 'muted-foreground': '0 0% 65%',
  primary: '13 80% 58%', border: '20 10% 20%', secondary: '20 10% 18%',
  sidebar: '20 14% 9%', 'sidebar-foreground': '0 0% 85%',
  'sidebar-accent': '20 12% 20%', 'sidebar-border': '20 10% 17%',
};

/**
 * `"H S% L%"` → `hsl(H, S%, L%)`, avec repli sur `fallback` si absent/invalide.
 * `themeColors` vient de la base (Paramètres → Thème, ADMIN uniquement) mais
 * finit interpolé dans une template string JS EMBARQUÉE dans un `<script>` —
 * une valeur non numérique (backtick, `</script>`, etc.) pourrait casser hors
 * du littéral et injecter du JS arbitraire. Chaque composant est donc validé
 * strictement (nombre optionnellement signé/décimal, `%` optionnel) avant
 * interpolation ; au moindre doute, repli sur `fallback` (jamais interpolé
 * tel quel non plus — reconstruit via les mêmes composants validés).
 */
function hsl(triplet: string | undefined, fallback: string): string {
  const safe = /^-?\d+(?:\.\d+)?%?$/;
  const build = (parts: string[]) => `hsl(${parts[0]}, ${parts[1]}, ${parts[2]})`;
  const fb = fallback.trim().split(/\s+/);
  const v = (triplet ?? '').trim().split(/\s+/);
  if (v.length === 3 && v.every((t) => safe.test(t))) return build(v);
  return build(fb);
}

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
    private readonly settings: SettingsService,
  ) {}

  /**
   * Thème custom éventuel (Paramètres → Thème), même source que le panel
   * lui-même et que le theme sync des addons — `themeColors` est stocké en
   * base comme une chaîne JSON (cf. le même bug déjà corrigé côté addons :
   * cette page ne l'avait jamais lu du tout, elle affichait toujours la
   * palette tangerine par défaut en dur, jamais le thème réellement configuré).
   */
  private getThemeColors(): ThemeColors | null {
    const raw = this.settings.get('themeColors');
    if (!raw) return null;
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }

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
      return { id: user.id, email: user.email, role: user.role as 'ADMIN' | 'USER' | 'SUPPORT' };
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

    // Thème custom du panel (Paramètres → Thème) s'il existe, sinon repli
    // sur la palette tangerine par défaut — jusqu'ici cette page ignorait
    // totalement le thème configuré et affichait toujours tangerine en dur.
    const theme = this.getThemeColors();
    const L = { ...DEFAULT_LIGHT, ...(theme?.light ?? {}) };
    const D = { ...DEFAULT_DARK, ...(theme?.dark ?? {}) };

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
            --scalar-color-1:      ${hsl(L['foreground'], '0 0% 20%')};
            --scalar-color-2:      ${hsl(L['muted-foreground'], '0 0% 45%')};
            --scalar-color-3:      ${hsl(L['muted-foreground'], '0 0% 55%')};
            --scalar-color-accent: ${hsl(L['primary'], '13 73% 54%')};
            --scalar-background-1: ${hsl(L['background'], '0 0% 100%')};
            --scalar-background-2: ${hsl(L['secondary'], '24 30% 95%')};
            --scalar-background-3: ${hsl(L['border'], '24 20% 90%')};
            --scalar-background-accent: ${hsl(L['primary'], '13 73% 54%').replace('hsl(', 'hsla(').replace(')', ', 0.08)')};
            --scalar-border-color: ${hsl(L['border'], '24 20% 90%')};
            --scalar-scrollbar-color: rgba(0,0,0,0.12);
            --scalar-scrollbar-color-active: ${hsl(L['primary'], '13 73% 54%')};
          }
          .light-mode .t-doc__sidebar {
            --scalar-sidebar-background-1: ${hsl(L['sidebar'], '24 30% 97%')};
            --scalar-sidebar-border-color:  ${hsl(L['sidebar-border'], '24 20% 88%')};
            --scalar-sidebar-color-1: ${hsl(L['sidebar-foreground'], '0 0% 25%')};
            --scalar-sidebar-item-hover-background: ${hsl(L['sidebar-accent'], '24 50% 90%')};
            --scalar-sidebar-item-active-background: ${hsl(L['secondary'], '24 30% 94%')};
          }

          /* ── Dark (défaut) ── */
          .dark-mode {
            --scalar-color-1:      ${hsl(D['foreground'], '0 0% 92%')};
            --scalar-color-2:      ${hsl(D['muted-foreground'], '0 0% 65%')};
            --scalar-color-3:      ${hsl(D['muted-foreground'], '0 0% 50%')};
            --scalar-color-accent: ${hsl(D['primary'], '13 80% 58%')};
            --scalar-background-1: ${hsl(D['background'], '20 14% 8%')};
            --scalar-background-2: ${hsl(D['secondary'], '20 14% 11%')};
            --scalar-background-3: ${hsl(D['border'], '20 10% 18%')};
            --scalar-background-accent: ${hsl(D['primary'], '13 80% 58%').replace('hsl(', 'hsla(').replace(')', ', 0.10)')};
            --scalar-border-color: ${hsl(D['border'], '20 10% 20%')};
            --scalar-scrollbar-color: rgba(255,255,255,0.08);
            --scalar-scrollbar-color-active: ${hsl(D['primary'], '13 80% 58%')};
          }
          .dark-mode .t-doc__sidebar {
            --scalar-sidebar-background-1: ${hsl(D['sidebar'], '20 14% 9%')};
            --scalar-sidebar-border-color:  ${hsl(D['sidebar-border'], '20 10% 17%')};
            --scalar-sidebar-color-1: ${hsl(D['sidebar-foreground'], '0 0% 85%')};
            --scalar-sidebar-color-2: ${hsl(D['muted-foreground'], '0 0% 55%')};
            --scalar-sidebar-item-hover-background: ${hsl(D['sidebar-accent'], '20 12% 20%')};
            --scalar-sidebar-item-active-background: ${hsl(D['secondary'], '20 10% 16%')};
            --scalar-sidebar-color-active: ${hsl(D['primary'], '13 80% 58%')};
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

