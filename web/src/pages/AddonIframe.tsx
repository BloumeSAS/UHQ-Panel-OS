import { useState, useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Card, CardContent } from '@/components/ui';

interface AddonPage {
  path: string;
  label: string;
  icon?: string;
  adminOnly?: boolean;
}

interface AddonManifest {
  name: string;
  icon?: string;
  pages: AddonPage[];
  translations?: Record<string, Record<string, string>>;
  auth?: { passJwt?: boolean; passUserInfo?: boolean };
}

/** Résout un label i18n depuis les traductions du manifest. */
function resolveLabel(
  label: string,
  manifest: AddonManifest,
  lang: string,
  t: (k: string) => string,
): string {
  const panelResolved = t(label);
  if (panelResolved !== label) return panelResolved;
  const tr = manifest.translations;
  if (tr) return tr[lang]?.[label] ?? tr['fr']?.[label] ?? tr['en']?.[label] ?? label;
  return label;
}

interface AddonItem {
  id: string;
  baseUrl: string;
  enabled: boolean;
  manifest: AddonManifest | null;
}

export default function AddonIframe() {
  // :id = addon id, :pagePath = encodeURIComponent(page.path)
  const { id, pagePath } = useParams<{ id: string; pagePath: string }>();
  const t = useT();
  const { user } = useAuth();
  const { lang } = useI18n();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);

  // Reset spinner quand la page change
  useEffect(() => { setLoading(true); }, [id, pagePath]);

  const { data: addons, isLoading } = useQuery({
    queryKey: ['addons'],
    queryFn: async () => (await api.get('/addons')).data.data as AddonItem[],
  });

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
        <span>{t('app.loading')}</span>
      </div>
    );
  }

  const addon = addons?.find((a) => a.id === id);
  if (!addon || !addon.manifest) return <Navigate to="/" replace />;

  const decodedPath = pagePath ? decodeURIComponent(pagePath) : '/';
  const page = addon.manifest.pages.find((p) => p.path === decodedPath);
  if (!page) return <Navigate to="/" replace />;

  // Garde admin
  if (page.adminOnly && user?.role !== 'ADMIN') return <Navigate to="/" replace />;

  // Construction de l'URL iframe
  const base = addon.baseUrl.replace(/\/+$/, '');
  const iframeUrl = buildIframeUrl(base, page.path, {
    passJwt: addon.manifest.auth?.passJwt,
    passUserInfo: addon.manifest.auth?.passUserInfo,
    lang,
    theme,
    user,
  });

  return (
    <div className="flex flex-col h-[calc(100vh-10.5rem)] space-y-4">
      {/* Header */}
      <div className="shrink-0">
        <h1 className="text-2xl font-bold">{resolveLabel(page.label, addon.manifest, lang, t)}</h1>
        <p className="text-xs text-muted-foreground">{addon.manifest.name}</p>
      </div>

      {/* Iframe */}
      <Card className="flex-1 overflow-hidden relative border bg-card">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
            <span className="text-sm font-medium">{t('app.loading')}</span>
          </div>
        )}
        <iframe
          key={iframeUrl}
          src={iframeUrl}
          title={page.label}
          className="w-full h-full border-none rounded-lg"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads"
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
        />
      </Card>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildIframeUrl(
  baseUrl: string,
  pagePath: string,
  opts: {
    passJwt?: boolean;
    passUserInfo?: boolean;
    lang?: string;
    theme?: string;
    user?: any;
  },
): string {
  const url = new URL(pagePath, baseUrl);

  // Contexte panel (langue + thème)
  if (opts.lang) url.searchParams.set('lang', opts.lang);
  if (opts.theme) url.searchParams.set('theme', opts.theme);

  // JWT — clé de stockage : uhq_token (voir web/src/lib/api.ts)
  if (opts.passJwt) {
    const token = getToken();
    if (token) url.searchParams.set('token', token);
  }

  // Info utilisateur
  if (opts.passUserInfo && opts.user) {
    url.searchParams.set('email', opts.user.email ?? '');
    url.searchParams.set('role', opts.user.role ?? '');
  }

  return url.toString();
}
