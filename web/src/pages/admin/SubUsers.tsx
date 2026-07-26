import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, List, Copy, Check, Pencil, Tag, Calendar, Zap, CheckSquare, Square, RotateCcw, ChevronLeft, ChevronRight, Upload, Link2, Ban, Eye } from 'lucide-react';
import { SlideOver } from '@/components/SlideOver';
import { AddonPageBar } from '@/components/AddonPageBar';
import { api, apiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Switch,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/dialog';
import { toast } from '@/lib/toast';

interface SubUser {
  id: string;
  username: string;
  password: string;
  label: string;
  threads_limit: number;
  traffic_limit: number | null;
  bytes_sent: number;
  bytes_received: number;
  country_filter: string | null;
  is_blocked: boolean;
  active_threads: number;
  sticky_session_ttl: number;
  custom_proxies: string | null;
  allowed_ips: string | null;
  bandwidth_limit: number | null;
  expires_at: string | null;
  tags: string | null;
  pool: string | null;
  port: number | null;
  domain: string | null;
}

function fmtGb(bytes: number) {
  return (bytes / 1024 ** 3).toFixed(3) + ' Go';
}

function fmtLimit(limit: number | null) {
  if (!limit) return '∞';
  return (limit / 1024 ** 3).toFixed(1) + ' Go';
}

export default function SubUsers() {
  const t = useT();
  const qc = useQueryClient();
  const [selectedTag, setSelectedTag] = useState('');

  const { data } = useQuery({
    queryKey: ['subusers'],
    queryFn: async () => (await api.get('/subusers')).data.data as SubUser[],
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['subusers'] });
  const block = useMutation({
    mutationFn: (v: { id: string; is_blocked: boolean }) =>
      api.post(`/subusers/${v.id}/set-blocked`, { is_blocked: v.is_blocked }),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/subusers/${id}`),
    onSuccess: invalidate,
  });

  const [sticky, setSticky] = useState<string[] | null>(null);
  const [rotating, setRotating] = useState<string | null>(null);
  const [editing, setEditing] = useState<SubUser | null>(null);
  const [sharingFor, setSharingFor] = useState<SubUser | null>(null);
  const [quickViewFor, setQuickViewFor] = useState<SubUser | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  useEffect(() => { setPage(0); }, [selectedTag]);

  const resetTraffic = useMutation({
    mutationFn: (id: string) => api.post(`/subusers/${id}/reset-traffic`),
    onSuccess: invalidate,
  });
  const bulkMutation = useMutation({
    mutationFn: (v: { action: string; ids: string[] }) => api.post('/subusers/bulk', v),
    onSuccess: () => {
      invalidate();
      setSelected(new Set());
      toast.success(t('users.bulkDone'));
    },
    onError: (e: any) => toast.error(e.response?.data?.message || t('common.error')),
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyCreds = (u: SubUser) => {
    navigator.clipboard.writeText(`${u.username}:${u.password}`);
    setCopiedId(u.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const showSticky = async (id: string) => {
    const { data } = await api.get(`/subusers/${id}/sticky-list?count=50`);
    setSticky(data.proxies);
    setRotating(data.rotating);
  };

  const usedGb = (u: SubUser) => u.bytes_sent + u.bytes_received;

  // Extract all unique tags
  const allTags = Array.from(
    new Set(
      (data ?? []).flatMap((u) =>
        (u.tags ?? '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ),
  );

  // Filter sub-users by selected tag
  const filteredData = data?.filter((u) => {
    if (!selectedTag) return true;
    const utags = (u.tags ?? '').split(',').map((t) => t.trim().toLowerCase());
    return utags.includes(selectedTag.trim().toLowerCase());
  });

  const totalPages = Math.ceil((filteredData?.length ?? 0) / PAGE_SIZE);
  const pagedData = filteredData?.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleAll = () => {
    const ids = filteredData?.map((u) => u.id) ?? [];
    if (ids.length > 0 && ids.every((id) => selected.has(id))) setSelected(new Set());
    else setSelected(new Set(ids));
  };
  const allSelected = (filteredData?.length ?? 0) > 0 && (filteredData ?? []).every((u) => selected.has(u.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('nav.subusers')}</h1>
        <div className="flex items-center gap-2">
          <BulkImportDialog onImported={invalidate} />
          <CreateDialog onCreated={invalidate} />
        </div>
      </div>

      {/* Tag Filter bar */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm bg-muted/40 p-3 rounded-lg border">
          <span className="text-muted-foreground font-medium mr-1 flex items-center gap-1">
            <Tag className="h-4 w-4" /> {t('sub.filterByTag')}
          </span>
          <button
            onClick={() => setSelectedTag('')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              !selectedTag
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:border-primary hover:text-foreground'
            }`}
          >
            {t('sub.tagAll')} ({data?.length})
          </button>
          {allTags.map((tag) => {
            const count = data?.filter((u) =>
              (u.tags ?? '')
                .split(',')
                .map((t) => t.trim().toLowerCase())
                .includes(tag.toLowerCase()),
            ).length;
            return (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selectedTag === tag
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-primary hover:text-foreground'
                }`}
              >
                #{tag} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/40 border">
          <span className="text-sm font-medium">{selected.size} {t('users.selected')}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => bulkMutation.mutate({ action: 'block', ids: Array.from(selected) })}>
              {t('sub.bulkBlock')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkMutation.mutate({ action: 'unblock', ids: Array.from(selected) })}>
              {t('sub.bulkUnblock')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => confirm(t('sub.confirmResetTraffic')) && bulkMutation.mutate({ action: 'reset-traffic', ids: Array.from(selected) })}>
              {t('sub.resetTraffic')}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => confirm(t('common.confirmDelete')) && bulkMutation.mutate({ action: 'delete', ids: Array.from(selected) })}>
              {t('common.delete')}
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH className="w-8">
                  <button onClick={toggleAll} className="flex items-center justify-center">
                    {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </button>
                </TH>
                <TH>{t('sub.label')}</TH>
                <TH>{t('sub.username')}</TH>
                <TH>{t('sub.password')}</TH>
                <TH>{t('sub.threads')}</TH>
                <TH>{t('sub.trafficUsed')}</TH>
                <TH>{t('sub.country')}</TH>
                <TH>{t('sub.blocked')}</TH>
                <TH className="text-right">{t('common.actions')}</TH>
              </TR>
            </THead>
            <TBody>
              {pagedData?.map((u) => {
                const isExpired = u.expires_at && new Date(u.expires_at) < new Date();
                return (
                  <TR key={u.id}>
                    <TD>
                      <button onClick={() => toggleSelect(u.id)} className="flex items-center justify-center">
                        {selected.has(u.id)
                          ? <CheckSquare className="h-4 w-4 text-primary" />
                          : <Square className="h-4 w-4 text-muted-foreground" />}
                      </button>
                    </TD>
                    <TD className="font-medium">
                      <div>{u.label}</div>
                      <div className="flex flex-wrap gap-1 mt-1.5 text-[10px]">
                        {u.bandwidth_limit && (
                          <span className="flex items-center gap-0.5 bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400 px-1.5 py-0.5 rounded font-mono">
                            <Zap className="h-3 w-3" /> {u.bandwidth_limit} {t('sub.kbps')}
                          </span>
                        )}
                        {u.expires_at && (
                          <span
                            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded font-mono ${
                              isExpired
                                ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
                            }`}
                          >
                            <Calendar className="h-3 w-3" />{' '}
                            {new Date(u.expires_at).toLocaleDateString()}
                            {isExpired && ' (Expiré)'}
                          </span>
                        )}
                        {(u.tags ?? '')
                          .split(',')
                          .filter(Boolean)
                          .map((tag: string) => (
                            <span
                              key={tag}
                              className="bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400 px-1.5 py-0.5 rounded font-mono"
                            >
                              #{tag.trim()}
                            </span>
                          ))}
                        {u.pool && (
                          <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400 px-1.5 py-0.5 rounded font-mono flex items-center gap-0.5">
                            ◆ {u.pool}
                          </span>
                        )}
                        {u.port && (
                          <span
                            className="bg-teal-100 text-teal-700 dark:bg-teal-950/30 dark:text-teal-400 px-1.5 py-0.5 rounded font-mono flex items-center gap-0.5"
                            title={t('sub.port')}
                          >
                            :{u.port}
                          </span>
                        )}
                        {u.domain && (
                          <span
                            className="bg-cyan-100 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400 px-1.5 py-0.5 rounded font-mono flex items-center gap-0.5"
                            title={t('sub.domain')}
                          >
                            {u.domain}
                          </span>
                        )}
                      </div>
                    </TD>
                    <TD className="font-mono text-xs">{u.username}</TD>
                    <TD className="font-mono text-xs">{u.password}</TD>
                    <TD>
                      <span className="text-sm">
                        {u.active_threads}/{u.threads_limit}
                      </span>
                    </TD>
                    <TD>
                      <span className="text-sm">
                        {fmtGb(usedGb(u))}
                        {u.traffic_limit ? (
                          <span className="text-muted-foreground"> / {fmtLimit(u.traffic_limit)}</span>
                        ) : (
                          <span className="text-muted-foreground"> / ∞</span>
                        )}
                      </span>
                      {u.traffic_limit && usedGb(u) >= u.traffic_limit && (
                        <Badge variant="destructive" className="ml-1 text-xs">
                          Limite
                        </Badge>
                      )}
                    </TD>
                    <TD>{u.country_filter || <span className="text-muted-foreground">—</span>}</TD>
                    <TD>
                      <Switch
                        checked={u.is_blocked}
                        onCheckedChange={(v) => block.mutate({ id: u.id, is_blocked: v })}
                      />
                    </TD>
                    <TD className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setQuickViewFor(u)} title="Vue rapide">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => copyCreds(u)} title={t('common.copy')}>
                        {copiedId === u.id
                          ? <Check className="h-4 w-4 text-emerald-500" />
                          : <Copy className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setEditing(u)} title={t('common.edit')}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => showSticky(u.id)} title={t('sub.stickyList')}>
                        <List className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setSharingFor(u)} title="Lien de partage">
                        <Link2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => confirm(t('sub.confirmResetTraffic')) && resetTraffic.mutate(u.id)}
                        title={t('sub.resetTraffic')}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => confirm(t('common.confirmDelete')) && del.mutate(u.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TD>
                  </TR>
                );
              })}
              {!filteredData?.length && (
                <TR>
                  <TD colSpan={9} className="py-8 text-center text-muted-foreground">
                    {t('common.none')}
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="h-8 gap-1">
                <ChevronLeft className="h-3.5 w-3.5" /> Précédent
              </Button>
              <span className="text-xs text-muted-foreground">
                Page <span className="font-semibold">{page + 1}</span> / {totalPages}
                <span className="ml-2 text-muted-foreground/60">({filteredData?.length} comptes)</span>
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="h-8 gap-1">
                Suivant <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sticky list dialog */}
      <Dialog
        open={!!sticky}
        onOpenChange={(o) => {
          if (!o) {
            setSticky(null);
            setRotating(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('sub.stickyList')}</DialogTitle>
          </DialogHeader>
          {rotating && (
            <div className="space-y-1.5">
              <Label>{t('sub.rotatingFormat')}</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-md border bg-muted px-3 py-2 text-xs">{rotating}</code>
                <Button variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(rotating)} title={t('common.copy')}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('sub.rotatingFormatHint')}</p>
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText((sticky ?? []).join('\n'))}>
              <Copy className="h-4 w-4" /> {t('common.copy')}
            </Button>
          </div>
          <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
            {(sticky ?? []).join('\n')}
          </pre>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      {editing && (
        <EditDialog
          subUser={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); invalidate(); }}
        />
      )}

      {/* Share link dialog */}
      {sharingFor && (
        <ShareLinkDialog subUser={sharingFor} onClose={() => setSharingFor(null)} />
      )}

      {/* Quick view slide-over */}
      <SlideOver open={!!quickViewFor} onClose={() => setQuickViewFor(null)} title={quickViewFor?.label ?? ''}>
        {quickViewFor && (
          <QuickView
            subUser={quickViewFor}
            onBlockToggle={(v) => block.mutate({ id: quickViewFor.id, is_blocked: v })}
            onResetTraffic={() => confirm(t('sub.confirmResetTraffic')) && resetTraffic.mutate(quickViewFor.id)}
            onEdit={() => { setQuickViewFor(null); setEditing(quickViewFor); }}
          />
        )}
      </SlideOver>

      {/* Widgets injectés automatiquement par les addons connectés */}
      <AddonPageBar />
    </div>
  );
}

// ── Vue rapide (slide-over) ─────────────────────────────────────────────────

function QuickView({
  subUser,
  onBlockToggle,
  onResetTraffic,
  onEdit,
}: {
  subUser: SubUser;
  onBlockToggle: (v: boolean) => void;
  onResetTraffic: () => void;
  onEdit: () => void;
}) {
  const used = fmtGb(subUser.bytes_sent + subUser.bytes_received);
  const limit = fmtLimit(subUser.traffic_limit);
  const pct = subUser.traffic_limit ? Math.min(100, ((subUser.bytes_sent + subUser.bytes_received) / subUser.traffic_limit) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${subUser.is_blocked ? 'bg-destructive/10 text-destructive' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400'}`}>
          {subUser.is_blocked ? 'Bloqué' : 'Actif'}
        </span>
        <Switch checked={subUser.is_blocked} onCheckedChange={onBlockToggle} />
      </div>

      <div className="space-y-2 text-sm">
        <QRow label="Username" value={subUser.username} />
        <QRow label="Password" value={subUser.password} />
        <QRow label="Threads" value={String(subUser.threads_limit)} />
        <QRow label="Pays" value={subUser.country_filter || '—'} />
        <QRow label="Tags" value={subUser.tags || '—'} />
        <QRow label="Port dédié" value={subUser.port ? String(subUser.port) : '—'} />
        <QRow label="Domaine" value={subUser.domain || '—'} />
        <QRow label="Expire" value={subUser.expires_at ? new Date(subUser.expires_at).toLocaleDateString() : '—'} />
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Trafic utilisé</span>
          <span>{used} / {limit}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted">
          <div className={`h-2 rounded-full transition-all ${pct >= 90 ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2 border-t">
        <Button variant="outline" size="sm" onClick={onResetTraffic}>
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset trafic
        </Button>
        <Button size="sm" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" /> Modifier
        </Button>
      </div>
    </div>
  );
}

function QRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-dashed last:border-0">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-mono text-xs truncate max-w-[220px]">{value}</span>
    </div>
  );
}

// ── Lien de partage temporaire ──────────────────────────────────────────────

interface ShareLink {
  id: string;
  token: string;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
}

const EXPIRY_PRESETS = [
  { label: '1 heure', hours: 1 },
  { label: '24 heures', hours: 24 },
  { label: '7 jours', hours: 24 * 7 },
  { label: '30 jours', hours: 24 * 30 },
  { label: 'Illimité (révocation manuelle)', hours: null as number | null },
];

function ShareLinkDialog({ subUser, onClose }: { subUser: SubUser; onClose: () => void }) {
  const [expiresInHours, setExpiresInHours] = useState<number | null>(24);
  const [busy, setBusy] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const { data: links, refetch } = useQuery({
    queryKey: ['share-links', subUser.id],
    queryFn: async () => (await api.get(`/subusers/${subUser.id}/share-links`)).data.data as ShareLink[],
  });

  const generate = async () => {
    setBusy(true);
    try {
      await api.post(`/subusers/${subUser.id}/share-links`, { expires_in_hours: expiresInHours });
      refetch();
      toast.success('Lien de partage créé.');
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (linkId: string) => {
    await api.post(`/subusers/share-links/${linkId}/revoke`);
    refetch();
  };

  const linkUrl = (token: string) => `${window.location.origin}/share/${token}`;

  const copy = (token: string) => {
    navigator.clipboard.writeText(linkUrl(token));
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 1500);
  };

  const status = (l: ShareLink) => {
    if (l.revoked) return { label: 'Révoqué', cls: 'text-destructive' };
    if (l.expiresAt && new Date(l.expiresAt) < new Date()) return { label: 'Expiré', cls: 'text-muted-foreground' };
    return { label: 'Actif', cls: 'text-emerald-600 dark:text-emerald-400' };
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lien de partage — {subUser.label}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Donne accès aux identifiants de connexion complets (username/password/host/port) sans créer de compte
            panel. Quiconque a le lien peut les voir jusqu'à expiration ou révocation.
          </p>

          <div className="flex items-center gap-2">
            <select
              value={String(expiresInHours)}
              onChange={(e) => setExpiresInHours(e.target.value === 'null' ? null : Number(e.target.value))}
              className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            >
              {EXPIRY_PRESETS.map((p) => (
                <option key={p.label} value={p.hours === null ? 'null' : p.hours}>{p.label}</option>
              ))}
            </select>
            <Button type="button" onClick={generate} disabled={busy}>Générer</Button>
          </div>

          <div className="space-y-2">
            {!links?.length && <p className="text-sm text-muted-foreground text-center py-4">Aucun lien généré.</p>}
            {links?.map((l) => {
              const s = status(l);
              return (
                <div key={l.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${s.cls}`}>{s.label}</span>
                      <span className="text-muted-foreground">
                        {l.expiresAt ? `expire ${new Date(l.expiresAt).toLocaleString()}` : 'sans expiration'}
                      </span>
                    </div>
                    <code className="block truncate text-muted-foreground mt-0.5">{linkUrl(l.token)}</code>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => copy(l.token)} title="Copier">
                    {copiedToken === l.token ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  {s.label === 'Actif' && (
                    <Button variant="ghost" size="icon" onClick={() => revoke(l.id)} title="Révoquer">
                      <Ban className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk CSV import dialog ──────────────────────────────────────────────────
// Format attendu, une ligne par compte : label,username,password,threads,quota_gb
// username/password/quota_gb sont optionnels (vide = généré / illimité).

interface ParsedRow {
  label: string;
  username?: string;
  password?: string;
  threads_limit: number;
  traffic_limit_bytes?: number;
}

function parseCsv(text: string): ParsedRow[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((line) => {
      const [label, username, password, threads, quotaGb] = line.split(',').map((s) => s.trim());
      return {
        label: label || username || 'Import',
        username: username || undefined,
        password: password || undefined,
        threads_limit: threads ? Number(threads) : 100,
        traffic_limit_bytes: quotaGb ? Math.round(Number(quotaGb) * 1024 ** 3) : undefined,
      };
    })
    .filter((r) => r.label);
}

function BulkImportDialog({ onImported }: { onImported: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; failed: number; errors: any[] } | null>(null);

  const rows = parseCsv(text);

  const submit = async () => {
    if (!rows.length) return;
    setBusy(true);
    setResult(null);
    try {
      const { data } = await api.post('/subusers/bulk-import', { items: rows });
      setResult(data);
      if (data.created > 0) onImported();
      if (!data.failed) {
        toast.success(`${data.created} compte(s) importé(s).`);
        setText('');
      }
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ''));
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setResult(null); } }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Upload className="h-4 w-4" /> Import CSV</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
        <DialogHeader>
          <DialogTitle>Import en masse (CSV)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Une ligne par compte : <code className="bg-muted px-1 rounded">label,username,password,threads,quota_gb</code>
            <br />Seul <code className="bg-muted px-1 rounded">label</code> est obligatoire — les autres champs vides sont générés (username/password) ou illimités (quota).
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'client1,,,100,50\nclient2,u_client2,MyP@ss,200,'}
            rows={8}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <div className="flex items-center justify-between">
            <label className="text-sm cursor-pointer inline-flex items-center gap-1.5 text-primary hover:underline">
              <Upload className="h-3.5 w-3.5" /> Charger un fichier .csv
              <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} className="hidden" />
            </label>
            <span className="text-xs text-muted-foreground">{rows.length} ligne(s) valide(s)</span>
          </div>

          {result && (
            <div className="rounded-md border p-3 text-sm space-y-1">
              <p className="text-emerald-600 dark:text-emerald-400">{result.created} compte(s) créé(s).</p>
              {result.failed > 0 && (
                <>
                  <p className="text-destructive">{result.failed} échec(s) :</p>
                  <ul className="text-xs text-muted-foreground max-h-32 overflow-y-auto list-disc pl-4">
                    {result.errors.map((e: any, i: number) => (
                      <li key={i}>Ligne {e.line}{e.username ? ` (${e.username})` : ''} : {e.error}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button type="button" onClick={submit} disabled={busy || !rows.length}>
            {busy ? '...' : `Importer (${rows.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Create dialog ─────────────────────────────────────────────────────────────

function CreateDialog({ onCreated }: { onCreated: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    label: '',
    threads_limit: 100,
    traffic_limit_gb: 0,
    country_filter: '',
    sticky_session_ttl: 1800,
    custom_proxies: '',
    allowed_ips: '',
    bandwidth_limit: 0,
    expires_at: '',
    tags: '',
    pool: '',
    port: '',
    domain: '',
  });
  const [error, setError] = useState('');
  const [templateId, setTemplateId] = useState('');
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const { data: templates, refetch: refetchTemplates } = useQuery({
    queryKey: ['subuser-templates'],
    queryFn: async () => (await api.get('/subuser-templates')).data.data as any[],
  });

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = templates?.find((t) => t.id === id);
    if (!tpl) return;
    setForm((f) => ({
      ...f,
      threads_limit: tpl.threadsLimit,
      traffic_limit_gb: tpl.trafficLimitGb ?? 0,
      country_filter: tpl.countryFilter || '',
      sticky_session_ttl: tpl.stickySessionTtl,
      bandwidth_limit: tpl.bandwidthLimit ?? 0,
    }));
  };

  const saveAsTemplate = async () => {
    const name = prompt('Nom du template :', form.label || 'Template');
    if (!name) return;
    try {
      await api.post('/subuser-templates', {
        name,
        threads_limit: Number(form.threads_limit),
        traffic_limit_gb: form.traffic_limit_gb > 0 ? Number(form.traffic_limit_gb) : undefined,
        country_filter: form.country_filter || undefined,
        sticky_session_ttl: Number(form.sticky_session_ttl),
        bandwidth_limit: form.bandwidth_limit ? Number(form.bandwidth_limit) : undefined,
      });
      refetchTemplates();
      toast.success('Template enregistré.');
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const traffic_limit_bytes = form.traffic_limit_gb > 0
        ? Math.round(form.traffic_limit_gb * 1024 ** 3)
        : undefined;
      await api.post('/subusers', {
        label: form.label,
        threads_limit: Number(form.threads_limit),
        traffic_limit_bytes,
        country_filter: form.country_filter || undefined,
        sticky_session_ttl: Number(form.sticky_session_ttl),
        custom_proxies: form.custom_proxies || undefined,
        allowed_ips: form.allowed_ips || undefined,
        bandwidth_limit: form.bandwidth_limit ? Number(form.bandwidth_limit) : undefined,
        expires_at: form.expires_at || undefined,
        tags: form.tags || undefined,
        pool: form.pool || undefined,
        port: form.port ? Number(form.port) : undefined,
        domain: form.domain || undefined,
      });
      setOpen(false);
      setForm({
        label: '',
        threads_limit: 100,
        traffic_limit_gb: 0,
        country_filter: '',
        sticky_session_ttl: 1800,
        custom_proxies: '',
        allowed_ips: '',
        bandwidth_limit: 0,
        expires_at: '',
        tags: '',
        pool: '',
        port: '',
        domain: '',
      });
      onCreated();
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> {t('sub.create')}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('sub.create')}</DialogTitle>
        </DialogHeader>
        {!!templates?.length && (
          <div className="flex items-center gap-2 pb-1">
            <select
              value={templateId}
              onChange={(e) => applyTemplate(e.target.value)}
              className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">Charger un template…</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
              ))}
            </select>
          </div>
        )}
        <SubUserForm form={form} set={set} error={error} onSubmit={submit} submitLabel={t('common.create')} />
        <button
          type="button"
          onClick={saveAsTemplate}
          className="text-xs text-muted-foreground hover:text-primary underline self-start"
        >
          Enregistrer ces réglages comme template
        </button>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit dialog ───────────────────────────────────────────────────────────────

function EditDialog({
  subUser, onClose, onSaved,
}: {
  subUser: SubUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [form, setForm] = useState({
    label: subUser.label,
    threads_limit: subUser.threads_limit,
    traffic_limit_gb: subUser.traffic_limit ? subUser.traffic_limit / 1024 ** 3 : 0,
    country_filter: subUser.country_filter || '',
    sticky_session_ttl: subUser.sticky_session_ttl,
    custom_proxies: subUser.custom_proxies || '',
    allowed_ips: subUser.allowed_ips || '',
    bandwidth_limit: subUser.bandwidth_limit || 0,
    expires_at: subUser.expires_at ? new Date(subUser.expires_at).toISOString().split('T')[0] : '',
    tags: subUser.tags || '',
    pool: subUser.pool || '',
    port: subUser.port != null ? String(subUser.port) : '',
    domain: subUser.domain || '',
  });
  const [error, setError] = useState('');
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const traffic_limit_bytes = form.traffic_limit_gb > 0
        ? Math.round(form.traffic_limit_gb * 1024 ** 3)
        : 0;
      await api.patch(`/subusers/${subUser.id}`, {
        label: form.label,
        threads_limit: Number(form.threads_limit),
        traffic_limit_bytes,
        country_filter: form.country_filter || undefined,
        sticky_session_ttl: Number(form.sticky_session_ttl),
        custom_proxies: form.custom_proxies || undefined,
        allowed_ips: form.allowed_ips || undefined,
        bandwidth_limit: form.bandwidth_limit ? Number(form.bandwidth_limit) : 0,
        expires_at: form.expires_at || null,
        tags: form.tags || null,
        pool: form.pool || null,
        port: form.port ? Number(form.port) : null,
        domain: form.domain || null,
      });
      onSaved();
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('common.edit')} — {subUser.username}</DialogTitle>
        </DialogHeader>
        <SubUserForm form={form} set={set} error={error} onSubmit={submit} submitLabel={t('common.save')} />
      </DialogContent>
    </Dialog>
  );
}

// ── Shared form ───────────────────────────────────────────────────────────────

function SubUserForm({
  form, set, error, onSubmit, submitLabel,
}: {
  form: any;
  set: (k: string, v: any) => void;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
}) {
  const t = useT();
  const { data: pools } = useQuery({
    queryKey: ['proxy-pools'],
    queryFn: async () => (await api.get('/proxy-pools')).data.data as { id: string; name: string }[],
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>{t('sub.label')}</Label>
        <Input value={form.label} onChange={(e) => set('label', e.target.value)} placeholder={t('sub.labelPlaceholder')} required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>{t('sub.threads')}</Label>
          <Input type="number" min={1} value={form.threads_limit} onChange={(e) => set('threads_limit', e.target.value)} placeholder={t('sub.threadsPlaceholder')} />
        </div>
        <div className="space-y-1.5">
          <Label>{t('sub.trafficLimit')}</Label>
          <Input
            type="number"
            min={0}
            step={0.1}
            value={form.traffic_limit_gb}
            onChange={(e) => set('traffic_limit_gb', parseFloat(e.target.value) || 0)}
            placeholder={t('sub.trafficPlaceholder')}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('sub.country')}</Label>
          <Input value={form.country_filter} onChange={(e) => set('country_filter', e.target.value)} placeholder="FR,DE" />
        </div>
        <div className="space-y-1.5">
          <Label>{t('sub.stickyTtl')}</Label>
          <Input type="number" min={60} value={form.sticky_session_ttl} onChange={(e) => set('sticky_session_ttl', e.target.value)} placeholder={t('sub.stickyTtlPlaceholder')} />
        </div>
        <div className="space-y-1.5">
          <Label>{t('sub.bandwidthLimit')}</Label>
          <Input
            type="number"
            min={0}
            value={form.bandwidth_limit}
            onChange={(e) => set('bandwidth_limit', parseInt(e.target.value) || 0)}
            placeholder={t('sub.bandwidthLimitPlaceholder')}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('sub.expiresAt')}</Label>
          <Input
            type="date"
            value={form.expires_at}
            onChange={(e) => set('expires_at', e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{t('sub.ipWhitelist')}</Label>
        <Input value={form.allowed_ips} onChange={(e) => set('allowed_ips', e.target.value)} placeholder="1.2.3.4,5.6.7.8" />
      </div>

      <div className="space-y-1.5">
        <Label>{t('sub.tags')}</Label>
        <Input
          value={form.tags}
          onChange={(e) => set('tags', e.target.value)}
          placeholder={t('sub.tagsPlaceholder')}
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t('pools.assign')}</Label>
        <select
          value={form.pool}
          onChange={(e) => set('pool', e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:ring-1 focus:ring-ring"
        >
          <option value="">{t('pools.noPool')}</option>
          {pools?.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label>{t('sub.port')}</Label>
        <Input
          type="number"
          min={9000}
          max={9250}
          value={form.port}
          onChange={(e) => set('port', e.target.value)}
          placeholder={t('sub.portPlaceholder')}
        />
        <p className="text-xs text-muted-foreground">{t('sub.portHint')}</p>
      </div>

      <div className="space-y-1.5">
        <Label>{t('sub.domain')}</Label>
        <Input
          value={form.domain}
          onChange={(e) => set('domain', e.target.value)}
          placeholder={t('sub.domainPlaceholder')}
        />
        <p className="text-xs text-muted-foreground">{t('sub.domainHint')}</p>
      </div>

      <div className="space-y-1.5">
        <Label>{t('sub.customProxies')}</Label>
        <textarea
          value={form.custom_proxies}
          onChange={(e) => set('custom_proxies', e.target.value)}
          rows={4}
          placeholder={'http://user:pass@1.2.3.4:8080\nsocks5://5.6.7.8:1080'}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <p className="text-xs text-muted-foreground">{t('sub.customProxiesHint')}</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DialogFooter>
        <Button type="submit">{submitLabel}</Button>
      </DialogFooter>
    </form>
  );
}
