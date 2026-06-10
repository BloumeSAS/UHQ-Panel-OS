import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Puzzle,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Eye,
  Loader2,
  Link2,
  LayoutGrid,
  ShieldAlert,
  ArrowUpCircle,
  Sparkles,
  Github,
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { useI18n, useT } from '@/lib/i18n';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
} from '@/components/ui';

interface AddonPage {
  path: string;
  label: string;
  icon?: string;
  showInNavbar?: boolean;
  adminOnly?: boolean;
}

interface AddonAuthor {
  name: string;
  email?: string;
  url?: string;
}

interface AddonSlot {
  zone: string;
  label: string;
  icon?: string;
  page: string;
  adminOnly?: boolean;
}

interface AddonManifest {
  name: string;
  version?: string;
  description?: string;
  icon?: string;
  author?: AddonAuthor | string;
  homepage?: string;
  repository?: string;
  license?: string;
  pages: AddonPage[];
  slots?: AddonSlot[];
  translations?: Record<string, Record<string, string>>;
  auth?: { passJwt?: boolean; passUserInfo?: boolean };
}

/**
 * Résout un label de page d'addon :
 *   1. Via t() du panel (fonctionne si les traductions sont déjà mergées — addon connecté)
 *   2. Directement depuis manifest.translations (fonctionne pour la preview)
 *   3. Fallback : affiche la clé telle quelle
 */
function resolveAddonLabel(
  label: string,
  manifest: AddonManifest,
  lang: string,
  t: (key: string) => string,
): string {
  // 1. Panel i18n déjà mergé
  const panelResolved = t(label);
  if (panelResolved !== label) return panelResolved;
  // 2. Traductions embarquées dans le manifest (preview ou addon fraîchement connecté)
  const tr = manifest.translations;
  if (tr) {
    return tr[lang]?.[label] ?? tr['fr']?.[label] ?? tr['en']?.[label] ?? label;
  }
  return label;
}

/** Normalise author string | object → { name, url? } */
function parseAuthor(author?: AddonAuthor | string): AddonAuthor | null {
  if (!author) return null;
  if (typeof author === 'string') {
    const m = author.match(/^([^<(]+?)(?:\s*<([^>]+)>)?(?:\s*\(([^)]+)\))?$/);
    if (!m) return { name: author };
    return { name: m[1].trim(), email: m[2], url: m[3] };
  }
  return author;
}

interface AddonItem {
  id: string;
  baseUrl: string;
  enabled: boolean;
  manifest: AddonManifest | null;
  manifestError: string | null;
  fetchedAt: string | null;
  createdAt: string;
  lastVersion: string | null;
  hasUpdate: boolean;
}

function AddonIcon({ name, className = 'h-5 w-5' }: { name?: string; className?: string }) {
  const Icon = (LucideIcons as any)[name ?? ''] ?? Puzzle;
  return <Icon className={className} />;
}

export default function Addons() {
  const t = useT();
  const qc = useQueryClient();

  const { data: addons = [], isLoading } = useQuery({
    queryKey: ['addons-all'],
    queryFn: async () => (await api.get('/addons/all')).data.data as AddonItem[],
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['addons-all'] });
    qc.invalidateQueries({ queryKey: ['addons'] });
  };

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch(`/addons/${id}`, { enabled }),
    onSuccess: invalidate,
  });

  const refresh = useMutation({
    mutationFn: (id: string) => api.post(`/addons/${id}/refresh`),
    onSuccess: invalidate,
  });

  const applyUpdate = useMutation({
    mutationFn: (id: string) => api.post(`/addons/${id}/update`),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/addons/${id}`),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutGrid className="h-6 w-6 text-primary" />
            {t('addons.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('addons.subtitle')}</p>
        </div>
      </div>

      {/* Zone d'ajout */}
      <AddAddonCard onAdded={invalidate} />

      {/* Liste des addons */}
      {isLoading ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Chargement…
        </div>
      ) : addons.length === 0 ? (
        <div className="flex flex-col items-center py-14 text-muted-foreground gap-3">
          <Puzzle className="h-10 w-10 opacity-30" />
          <p className="text-sm">{t('addons.none')}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {addons.map((addon) => (
            <AddonCard
              key={addon.id}
              addon={addon}
              onToggle={(v) => toggle.mutate({ id: addon.id, enabled: v })}
              onRefresh={() => refresh.mutate(addon.id)}
              onUpdate={() => applyUpdate.mutate(addon.id)}
              onRemove={() => confirm(t('addons.confirmRemove')) && remove.mutate(addon.id)}
              refreshing={refresh.isPending && refresh.variables === addon.id}
              updating={applyUpdate.isPending && applyUpdate.variables === addon.id}
            />
          ))}
        </div>
      )}

      {/* Extensions officielles gratuites */}
      <RegistrySection installedUrls={addons.map((a) => a.baseUrl)} />

      {/* Docs du format manifest */}
      <ManifestDocs />
    </div>
  );
}

// ─── Carte d'ajout ────────────────────────────────────────────────────────────

function AddAddonCard({ onAdded }: { onAdded: () => void }) {
  const { lang, t } = useI18n();
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<AddonManifest | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [addError, setAddError] = useState('');

  const previewMutation = useMutation({
    mutationFn: (u: string) => api.get(`/addons/preview?url=${encodeURIComponent(u)}`),
    onSuccess: (res) => { setPreview(res.data.data); setPreviewError(''); },
    onError: (err) => { setPreviewError(apiError(err)); setPreview(null); },
  });

  const addMutation = useMutation({
    mutationFn: (u: string) => api.post('/addons', { baseUrl: u }),
    onSuccess: () => { setUrl(''); setPreview(null); onAdded(); },
    onError: (err) => setAddError(apiError(err)),
  });

  return (
    <Card className="border-dashed border-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          {t('addons.connect')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t('addons.connectHint')}</p>
        <div className="flex gap-2">
          <Input
            value={url}
            onChange={(e) => { setUrl(e.target.value); setPreview(null); setPreviewError(''); setAddError(''); }}
            placeholder="https://shop.example.com"
            className="flex-1 font-mono text-sm"
          />
          <Button
            variant="secondary"
            onClick={() => url && previewMutation.mutate(url)}
            disabled={!url || previewMutation.isPending}
            title={t('addons.preview')}
          >
            {previewMutation.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Eye className="h-4 w-4" />}
          </Button>
        </div>

        {/* Erreur preview */}
        {previewError && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{previewError}</span>
          </div>
        )}

        {/* Preview manifest */}
        {preview && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <AddonIcon name={preview.icon} className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{preview.name}</p>
                  {preview.version && (
                    <Badge variant="secondary" className="text-xs">v{preview.version}</Badge>
                  )}
                  <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto" />
                </div>
                {preview.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{preview.description}</p>
                )}
              </div>
            </div>

            {/* Pages */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                {preview.pages.length} page{preview.pages.length > 1 ? 's' : ''} disponible{preview.pages.length > 1 ? 's' : ''}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {preview.pages.map((p) => (
                  <span
                    key={p.path}
                    className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs"
                  >
                    <AddonIcon name={p.icon ?? preview.icon} className="h-3 w-3 opacity-70" />
                    {resolveAddonLabel(p.label, preview, lang, t)}
                    {p.adminOnly && <ShieldAlert className="h-3 w-3 text-primary opacity-70" />}
                  </span>
                ))}
              </div>
            </div>

            {/* Auteur + homepage (preview) */}
            {(preview.author || preview.homepage) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {(() => {
                  const a = parseAuthor(preview.author);
                  if (!a) return null;
                  return a.url ? (
                    <a href={a.url} target="_blank" rel="noopener noreferrer"
                       className="flex items-center gap-1 hover:text-primary transition-colors">
                      <span>✦</span> {a.name}
                    </a>
                  ) : (
                    <span className="flex items-center gap-1"><span>✦</span> {a.name}</span>
                  );
                })()}
                {preview.homepage && (
                  <a href={preview.homepage} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-1 hover:text-primary transition-colors">
                    <ExternalLink className="h-3 w-3" /> Docs
                  </a>
                )}
                {preview.license && (
                  <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[0.65rem]">
                    {preview.license}
                  </span>
                )}
              </div>
            )}

            {/* Auth */}
            {preview.auth?.passJwt && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                Authentification JWT panel activée
              </p>
            )}

            {addError && <p className="text-xs text-destructive">{addError}</p>}

            <Button
              className="w-full"
              onClick={() => addMutation.mutate(url)}
              disabled={addMutation.isPending}
            >
              {addMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              <Plus className="h-4 w-4 mr-1.5" />
              {t('addons.addAddon')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Carte addon ──────────────────────────────────────────────────────────────

function AddonCard({
  addon,
  onToggle,
  onRefresh,
  onUpdate,
  onRemove,
  refreshing,
  updating,
}: {
  addon: AddonItem;
  onToggle: (v: boolean) => void;
  onRefresh: () => void;
  onUpdate: () => void;
  onRemove: () => void;
  refreshing: boolean;
  updating: boolean;
}) {
  const { lang, t } = useI18n();
  const m = addon.manifest;
  const hasError = !!addon.manifestError && !m;

  return (
    <Card className={!addon.enabled ? 'opacity-60' : ''}>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            hasError ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
          }`}>
            {hasError
              ? <AlertCircle className="h-5 w-5" />
              : <AddonIcon name={m?.icon} className="h-5 w-5" />
            }
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold truncate">{m?.name ?? addon.baseUrl}</p>
              {m?.version && <Badge variant="secondary" className="text-xs shrink-0">v{m.version}</Badge>}
            </div>
            <a
              href={addon.baseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-primary truncate flex items-center gap-0.5 max-w-full"
            >
              <span className="truncate">{addon.baseUrl}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
        </div>

        {/* Bandeau mise à jour disponible */}
        {addon.hasUpdate && m?.version && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/8 px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <ArrowUpCircle className="h-4 w-4 shrink-0 text-primary" />
              <span>
                <span className="font-semibold text-foreground">Mise à jour disponible</span>
                {addon.lastVersion && (
                  <span className="ml-1 text-muted-foreground">
                    v{addon.lastVersion} → <span className="text-primary font-medium">v{m.version}</span>
                  </span>
                )}
              </span>
            </div>
            <Button
              size="sm"
              className="h-7 shrink-0 text-xs"
              onClick={onUpdate}
              disabled={updating}
            >
              {updating
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <ArrowUpCircle className="h-3 w-3 mr-1" />}
              Mettre à jour
            </Button>
          </div>
        )}

        {/* Description */}
        {m?.description && (
          <p className="text-xs text-muted-foreground leading-relaxed">{m.description}</p>
        )}

        {/* Auteur + homepage */}
        {(m?.author || m?.homepage) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {(() => {
              const a = parseAuthor(m?.author);
              if (!a) return null;
              return a.url ? (
                <a href={a.url} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-1 hover:text-primary transition-colors">
                  <span>✦</span> {a.name}
                </a>
              ) : (
                <span className="flex items-center gap-1"><span>✦</span> {a.name}</span>
              );
            })()}
            {m?.homepage && (
              <a href={m.homepage} target="_blank" rel="noopener noreferrer"
                 className="flex items-center gap-1 hover:text-primary transition-colors">
                <ExternalLink className="h-3 w-3" /> Docs
              </a>
            )}
            {m?.license && (
              <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[0.65rem]">
                {m.license}
              </span>
            )}
          </div>
        )}

        {/* Erreur manifest */}
        {addon.manifestError && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-2 text-xs text-destructive">
            {addon.manifestError}
          </div>
        )}

        {/* Pages */}
        {m && m.pages.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {m.pages.map((p) => (
              <span
                key={p.path}
                className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                <AddonIcon name={p.icon ?? m.icon} className="h-3 w-3" />
                {resolveAddonLabel(p.label, m, lang, t)}
                {p.adminOnly && <ShieldAlert className="h-3 w-3 text-primary" />}
              </span>
            ))}
          </div>
        )}

        {/* Slots UI */}
        {m && (m.slots ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(m.slots ?? []).map((s, i) => (
              <span
                key={i}
                className="flex items-center gap-1 rounded border border-border bg-muted/40 px-2 py-0.5 text-[0.65rem] text-muted-foreground"
                title={`Zone : ${s.zone}`}
              >
                <AddonIcon name={s.icon} className="h-3 w-3" />
                {resolveAddonLabel(s.label, m, lang, t)}
                <span className="opacity-50">→ {s.zone}</span>
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-1 border-t">
          <Switch
            checked={addon.enabled}
            onCheckedChange={onToggle}
          />
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onRefresh}
              disabled={refreshing}
              title="Rafraîchir le manifest"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onRemove}
              title="Déconnecter"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Registre extensions officielles ─────────────────────────────────────────

interface RegistryAddon {
  name: string;
  slug: string;
  version: string;
  description: string;
  icon?: string;
  free: boolean;
  official: boolean;
  license?: string;
  author?: AddonAuthor | string;
  repository?: string;
  homepage?: string;
  tags?: string[];
  requires?: string[];
  features?: string[];
}

function RegistrySection({ installedUrls }: { installedUrls: string[] }) {
  const t = useT();

  const { data, isLoading } = useQuery({
    queryKey: ['addon-registry'],
    queryFn: async () => (await api.get('/addons/registry')).data.data as RegistryAddon[],
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !data?.length) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{t('addons.discover')}</h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">{t('addons.discoverHint')}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.map((addon) => {
          const isConnected = installedUrls.some((u) =>
            u.toLowerCase().includes(addon.slug.toLowerCase()),
          );
          return (
            <Card key={addon.slug} className="relative overflow-hidden">
              <CardContent className="p-4 space-y-3">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <AddonIcon name={addon.icon} className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-semibold">{addon.name}</p>
                      <Badge variant="secondary" className="text-xs">v{addon.version}</Badge>
                      {addon.official && (
                        <Badge className="text-xs bg-primary/15 text-primary border-primary/20 hover:bg-primary/15">
                          {t('addons.officialBadge')}
                        </Badge>
                      )}
                      {addon.free && (
                        <Badge variant="outline" className="text-xs text-green-600 border-green-600/40">
                          {t('addons.freeBadge')}
                        </Badge>
                      )}
                      {isConnected && (
                        <Badge variant="outline" className="text-xs text-primary border-primary/40 ml-auto">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          {t('addons.alreadyConnected')}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-muted-foreground leading-relaxed">{addon.description}</p>

                {/* Features */}
                {addon.features && addon.features.length > 0 && (
                  <ul className="space-y-0.5">
                    {addon.features.map((f) => (
                      <li key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Tags + requires */}
                <div className="flex flex-wrap gap-1">
                  {addon.tags?.map((tag) => (
                    <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                  {addon.requires && addon.requires.length > 0 && (
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[0.65rem] text-amber-600">
                      {t('addons.requires')} : {addon.requires.join(', ')}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  {addon.repository && (
                    <a
                      href={addon.repository}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1"
                    >
                      <Button variant="outline" size="sm" className="w-full text-xs gap-1.5">
                        <Github className="h-3.5 w-3.5" />
                        {t('addons.deployBtn')}
                      </Button>
                    </a>
                  )}
                  {addon.homepage && (
                    <a
                      href={addon.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="ghost" size="sm" className="text-xs gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t('addons.docsBtn')}
                      </Button>
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Docs format manifest ─────────────────────────────────────────────────────

function ManifestDocs() {
  const [open, setOpen] = useState(false);
  const example = `// uhq-manifest.json (à la racine de l'addon)
{
  "name": "Boutique",
  "version": "1.0.0",
  "description": "Module boutique pour UHQ Panel OS",
  "icon": "ShoppingBag",
  "pages": [
    {
      "path": "/",
      "label": "Boutique",
      "icon": "ShoppingBag",
      "showInNavbar": true,
      "adminOnly": false
    },
    {
      "path": "/admin",
      "label": "Admin boutique",
      "icon": "Store",
      "showInNavbar": true,
      "adminOnly": true
    }
  ],
  "slots": [
    {
      "zone":      "topbar",
      "label":     "Mon solde",
      "icon":      "Wallet",
      "page":      "/",
      "adminOnly": false
    }
  ],
  "auth": {
    "passJwt": true
  }
}

// ── Zones disponibles pour "slots" ──────────────────────────────────────────
// "topbar"  → dropdown en haut à droite du panel (à côté du bouton déconnexion)
//
// ── Le panel appellera vos pages avec : ────────────────────────────────────
// https://shop.example.com/?token=<jwt>&lang=fr&theme=dark&role=ADMIN
//
// Votre addon peut utiliser ce token pour appeler l'API panel :
// Authorization: Bearer <token>  →  GET /api/panel/me  etc.`;

  return (
    <Card className="border-muted/60">
      <CardContent className="p-4">
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="flex items-center gap-2">
            <Puzzle className="h-4 w-4" />
            Format du manifest uhq-manifest.json
          </span>
          <span className="text-xs opacity-60">{open ? '▲ masquer' : '▼ afficher'}</span>
        </button>
        {open && (
          <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-4 text-xs text-muted-foreground leading-relaxed font-mono whitespace-pre-wrap">
            {example}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
