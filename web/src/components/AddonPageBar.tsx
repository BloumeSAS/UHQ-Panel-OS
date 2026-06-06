import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as LucideIcons from 'lucide-react';
import { Puzzle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

interface AddonWidget {
  zone: string;
  path: string;
  height?: number;
  label?: string;
}

interface AddonManifest {
  icon?: string;
  widgets?: AddonWidget[];
  translations?: Record<string, Record<string, string>>;
  auth?: { passJwt?: boolean; passUserInfo?: boolean };
}

interface AddonItem {
  id: string;
  baseUrl: string;
  enabled: boolean;
  manifest: AddonManifest | null;
}

/**
 * Barre d'addons générique — à placer en bas de n'importe quelle page.
 *
 * Elle affiche automatiquement TOUS les widgets des addons connectés
 * qui ont déclaré `"zone": "<pathname>"` dans leur manifest.
 *
 * Ex. pour un addon qui veut s'afficher sur /subusers :
 *   "widgets": [{ "zone": "/subusers", "path": "/widget/balances", "height": 300 }]
 *
 * Aucun code panel à modifier pour accueillir un nouvel addon.
 * Si aucun addon n'a de widget pour la page courante, ce composant est invisible.
 */
export function AddonPageBar() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { lang, t } = useI18n();
  const { theme } = useTheme();

  const { data: addons } = useQuery({
    queryKey: ['addons'],
    queryFn: async () => {
      try {
        return (await api.get('/addons')).data.data as AddonItem[];
      } catch {
        return [] as AddonItem[];
      }
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // Tous les widgets dont la zone = pathname courant
  const slots = (addons ?? [])
    .filter((a) => a.enabled && a.manifest)
    .flatMap((addon) =>
      (addon.manifest!.widgets ?? [])
        .filter((w) => w.zone === pathname || w.zone === '*')
        .map((w) => ({ addon, widget: w })),
    );

  if (slots.length === 0) return null;

  return (
    <div className="mt-6 space-y-3">
      {slots.map(({ addon, widget }) => {
        const label = widget.label ? t(widget.label) : addon.manifest?.icon
          ? undefined
          : null;
        const Icon = (LucideIcons as any)[addon.manifest?.icon ?? ''] ?? Puzzle;
        const url = buildUrl(addon.baseUrl, widget.path, {
          lang,
          theme,
          passJwt: addon.manifest!.auth?.passJwt,
          passUserInfo: addon.manifest!.auth?.passUserInfo,
          user,
          page: pathname,
        });

        return (
          <div
            key={addon.id + widget.path}
            className="rounded-lg border bg-card overflow-hidden"
          >
            {label !== null && (
              <div className="flex items-center gap-2 px-4 py-2.5 border-b text-sm font-medium text-muted-foreground">
                <Icon className="h-4 w-4 text-primary" />
                {label ?? ''}
              </div>
            )}
            <iframe
              src={url}
              title={`addon-${addon.id}`}
              style={{
                border: 'none',
                width: '100%',
                height: widget.height ?? 300,
                display: 'block',
                background: 'transparent',
              }}
              sandbox="allow-same-origin allow-scripts allow-forms allow-downloads"
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildUrl(
  baseUrl: string,
  widgetPath: string,
  opts: {
    lang: string;
    theme: string;
    passJwt?: boolean;
    passUserInfo?: boolean;
    user?: any;
    page?: string;
  },
): string {
  const base = baseUrl.replace(/\/+$/, '');
  const url = new URL(
    widgetPath.startsWith('/') ? widgetPath : '/' + widgetPath,
    base + '/',
  );

  url.searchParams.set('lang', opts.lang);
  url.searchParams.set('theme', opts.theme);
  if (opts.page) url.searchParams.set('page', opts.page);

  if (opts.passJwt) {
    const token = localStorage.getItem('token');
    if (token) url.searchParams.set('token', token);
  }
  if (opts.passUserInfo && opts.user) {
    url.searchParams.set('email', opts.user.email ?? '');
    url.searchParams.set('role', opts.user.role ?? '');
  }

  return url.toString();
}
