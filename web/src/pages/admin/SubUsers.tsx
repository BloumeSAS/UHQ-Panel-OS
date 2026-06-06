import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, List, Copy, Pencil, Tag, Calendar, Zap } from 'lucide-react';
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
  const [editing, setEditing] = useState<SubUser | null>(null);

  const showSticky = async (id: string) => {
    const { data } = await api.get(`/subusers/${id}/sticky-list?count=50`);
    setSticky(data.proxies);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('nav.subusers')}</h1>
        <CreateDialog onCreated={invalidate} />
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

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
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
              {filteredData?.map((u) => {
                const isExpired = u.expires_at && new Date(u.expires_at) < new Date();
                return (
                  <TR key={u.id}>
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
                      <Button variant="ghost" size="icon" onClick={() => setEditing(u)} title={t('common.edit')}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => showSticky(u.id)} title={t('sub.stickyList')}>
                        <List className="h-4 w-4" />
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
                  <TD colSpan={8} className="py-8 text-center text-muted-foreground">
                    {t('common.none')}
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {/* Sticky list dialog */}
      <Dialog open={!!sticky} onOpenChange={(o) => !o && setSticky(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('sub.stickyList')}</DialogTitle>
          </DialogHeader>
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

      {/* Widgets injectés automatiquement par les addons connectés */}
      <AddonPageBar />
    </div>
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
  });
  const [error, setError] = useState('');
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

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
        <SubUserForm form={form} set={set} error={error} onSubmit={submit} submitLabel={t('common.create')} />
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
