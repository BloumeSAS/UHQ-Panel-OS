import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

interface AddonWidget {
  zone: string;
  path: string;
  height?: number;
  passContext?: string[];
}

interface AddonItem {
  id: string;
  baseUrl: string;
  enabled: boolean;
  manifest: {
    icon?: string;
    widgets?: AddonWidget[];
    auth?: { passJwt?: boolean; passUserInfo?: boolean };
  } | null;
}

interface AddonWidgetSlotProps {
  /** Zone d'injection — doit correspondre à widget.zone dans le manifest */
  zone: string;
  /** Contexte passé en query params à l'iframe (ex. { userId: "xxx", username: "yyy" }) */
  context?: Record<string, string>;
  className?: string;
}

/**
 * Injecte les widgets d'addons pour une zone donnée du panel.
 *
 * Usage dans une page panel :
 *   <AddonWidgetSlot zone="subuser-balance" context={{ userId: u.id }} />
 *
 * L'addon déclare dans son manifest :
 *   "widgets": [{ "zone": "subuser-balance", "path": "/widget/balance", "height": 36 }]
 *
 * Le widget reçoit en query params :
 *   ?token=<jwt>&lang=fr&theme=dark&userId=<id>&...context
 */
export function AddonWidgetSlot({ zone, context = {}, className }: AddonWidgetSlotProps) {
  const { user } = useAuth();
  const { lang } = useI18n();
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

  const slots = (addons ?? [])
    .filter((a) => a.enabled && a.manifest)
    .flatMap((addon) =>
      (addon.manifest!.widgets ?? [])
        .filter((w) => w.zone === zone)
        .map((w) => ({ addon, widget: w })),
    );

  if (slots.length === 0) return null;

  return (
    <div className={className}>
      {slots.map(({ addon, widget }) => {
        const url = buildWidgetUrl(addon.baseUrl, widget.path, {
          lang,
          theme,
          passJwt: addon.manifest!.auth?.passJwt,
          passUserInfo: addon.manifest!.auth?.passUserInfo,
          user,
          context,
        });
        return (
          <iframe
            key={addon.id + widget.path}
            src={url}
            title={`widget-${zone}-${addon.id}`}
            style={{
              border: 'none',
              background: 'transparent',
              height: widget.height ?? 40,
              width: '100%',
              display: 'block',
            }}
            sandbox="allow-same-origin allow-scripts allow-forms"
          />
        );
      })}
    </div>
  );
}

/**
 * Indique si au moins un addon actif a un widget pour la zone donnée.
 * Permet d'afficher/masquer des colonnes conditionnellement.
 */
export function useHasAddonZone(zone: string): boolean {
  const { user } = useAuth();
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
  return (addons ?? []).some((a) =>
    a.enabled && (a.manifest?.widgets ?? []).some((w) => w.zone === zone),
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildWidgetUrl(
  baseUrl: string,
  widgetPath: string,
  opts: {
    lang: string;
    theme: string;
    passJwt?: boolean;
    passUserInfo?: boolean;
    user?: any;
    context: Record<string, string>;
  },
): string {
  const base = baseUrl.replace(/\/+$/, '');
  const url = new URL(widgetPath.startsWith('/') ? widgetPath : '/' + widgetPath, base + '/');

  url.searchParams.set('lang', opts.lang);
  url.searchParams.set('theme', opts.theme);

  if (opts.passJwt) {
    const token = localStorage.getItem('token');
    if (token) url.searchParams.set('token', token);
  }
  if (opts.passUserInfo && opts.user) {
    url.searchParams.set('email', opts.user.email ?? '');
    url.searchParams.set('role', opts.user.role ?? '');
  }
  for (const [k, v] of Object.entries(opts.context)) {
    url.searchParams.set(k, v);
  }

  return url.toString();
}
