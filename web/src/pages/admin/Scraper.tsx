import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, FlaskConical, Play, Pencil, Layers, CheckSquare, Square, Wand2, RotateCcw, AlertTriangle, Search, ChevronLeft, ChevronRight, StopCircle, Activity } from 'lucide-react';
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
import { useConfirm } from '@/components/ConfirmDialog';

interface Source {
  id: string;
  name: string;
  url: string;
  protocol: string;
  pattern: string | null;
  enabled: boolean;
  pool: string | null;
  failCount: number;
  lastError: string | null;
  lastSuccess: string | null;
}

export default function Scraper() {
  const t = useT();
  const qc = useQueryClient();
  const confirmDialog = useConfirm();
  const { data } = useQuery({
    queryKey: ['scraper-sources'],
    queryFn: async () => (await api.get('/scraper-sources')).data.data as Source[],
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['scraper-sources'] });

  const toggle = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) =>
      api.patch(`/scraper-sources/${v.id}`, { enabled: v.enabled }),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/scraper-sources/${id}`),
    onSuccess: invalidate,
  });

  const [editing, setEditing] = useState<Source | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const filtered = (data ?? []).filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleSelect = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => {
    const ids = paged.map((s) => s.id);
    setSelected(ids.length > 0 && ids.every((id) => selected.has(id)) ? new Set() : new Set(ids));
  };
  const allSelected = paged.length > 0 && paged.every((s) => selected.has(s.id));

  useEffect(() => { setPage(1); }, [search]);

  const bulkDelete = async () => {
    const n = selected.size;
    const ok = await confirmDialog({ title: t('common.delete'), description: t('scraper.bulkDeleteConfirm').replace('{n}', String(n)), destructive: true });
    if (!ok) return;
    await api.post('/scraper-sources/bulk-delete', { ids: Array.from(selected) });
    setSelected(new Set());
    invalidate();
  };

  const deleteAll = async () => {
    const ok = await confirmDialog({ title: t('scraper.deleteAll'), description: t('scraper.deleteAllConfirm'), destructive: true });
    if (!ok) return;
    await api.delete('/scraper-sources');
    setSelected(new Set());
    invalidate();
  };

  const [testResult, setTestResult] = useState<string>('');
  const test = async (id: string) => {
    setTestResult('…');
    try {
      const { data } = await api.post(`/scraper-sources/${id}/test`);
      setTestResult(
        data.status === 'success'
          ? `✓ ${data.count} proxies — ex: ${data.sample.join(', ') || '—'}`
          : `✗ ${data.message}`,
      );
    } catch (e) {
      setTestResult(`✗ ${apiError(e)}`);
    }
  };
  const [liveOpen, setLiveOpen] = useState(false);
  const { data: liveStatus } = useQuery({
    queryKey: ['scraper-status'],
    queryFn: async () => (await api.get('/scraper-sources/status')).data.data as {
      running: boolean;
      loopEnabled: boolean;
      sourcesTotal: number;
      sourcesDone: number;
      itemsCollected: number;
      lastRun: string | null;
      lastRunDurationMs: number;
      lastRunCollected: number;
    },
    refetchInterval: (query) => (query.state.data?.running ? 1500 : 10000),
  });
  const stopLoop = () => api.post('/scraper-sources/stop').then(() => qc.invalidateQueries({ queryKey: ['scraper-status'] }));
  const startLoop = () => api.post('/scraper-sources/start').then(() => qc.invalidateQueries({ queryKey: ['scraper-status'] }));
  const runNow = () => {
    api.post('/scraper-sources/run');
    setLiveOpen(true);
  };
  const resetFail = async (id: string) => {
    await api.post(`/scraper-sources/${id}/reset-fail`);
    invalidate();
  };
  const deadCount = data?.filter((s) => s.failCount > 0 || !s.enabled).length ?? 0;
  const resetAllFailed = async () => {
    const ok = await confirmDialog({ title: t('scraper.resetAllFailed'), description: t('scraper.resetAllConfirm') });
    if (!ok) return;
    await api.post('/scraper-sources/reset-all-failed');
    invalidate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('scraper.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('scraper.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setLiveOpen(true)}>
            <Activity className="h-4 w-4" /> {t('scraper.liveStats')}
            {liveStatus?.running && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />}
          </Button>
          {liveStatus?.loopEnabled ? (
            <Button variant="outline" className="text-destructive border-destructive/50 hover:bg-destructive/10" onClick={stopLoop}>
              <StopCircle className="h-4 w-4" /> {t('scraper.stopLoop')}
            </Button>
          ) : (
            <Button variant="outline" onClick={startLoop}>
              <Play className="h-4 w-4" /> {t('scraper.startLoop')}
            </Button>
          )}
          <Button variant="outline" onClick={() => runNow()}>
            <Play className="h-4 w-4" /> {t('scraper.runNow')}
          </Button>
          {deadCount > 0 && (
            <Button variant="outline" onClick={resetAllFailed}>
              <RotateCcw className="h-4 w-4 text-amber-500" /> {t('scraper.resetAllFailed')} ({deadCount})
            </Button>
          )}
          {(data?.length ?? 0) > 0 && (
            <Button variant="outline" onClick={deleteAll}>
              <Trash2 className="h-4 w-4 text-destructive" /> {t('scraper.deleteAll')}
            </Button>
          )}
          <BulkCreateDialog onCreated={invalidate} />
          <CreateDialog onCreated={invalidate} />
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-accent/40 p-3">
          <span className="text-sm font-medium">{selected.size} sélectionnée{selected.size > 1 ? 's' : ''}</span>
          <Button size="sm" variant="destructive" className="ml-auto" onClick={bulkDelete}>
            <Trash2 className="h-3.5 w-3.5" /> {t('common.delete')}
          </Button>
        </div>
      )}

      {testResult && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm font-mono">{testResult}</div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('scraper.searchPlaceholder')}
          className="pl-8"
        />
      </div>

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
                <TH>{t('scraper.name')}</TH>
                <TH>{t('scraper.url')}</TH>
                <TH>{t('scraper.protocol')}</TH>
                <TH>{t('pools.assign')}</TH>
                <TH>{t('scraper.enabled')}</TH>
                <TH className="text-right">{t('common.actions')}</TH>
              </TR>
            </THead>
            <TBody>
              {paged.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <button onClick={() => toggleSelect(s.id)} className="flex items-center justify-center">
                      {selected.has(s.id)
                        ? <CheckSquare className="h-4 w-4 text-primary" />
                        : <Square className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  </TD>
                  <TD>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5 font-medium">
                        {s.name}
                        {s.failCount > 0 && !s.enabled && (
                          <Badge variant="destructive" className="text-[9px] px-1 py-0">{t('scraper.sourceDead')}</Badge>
                        )}
                        {s.failCount > 0 && s.enabled && (
                          <span className="flex items-center gap-0.5 text-[10px] font-medium text-amber-500">
                            <AlertTriangle className="h-3 w-3" />{s.failCount}/5
                          </span>
                        )}
                      </div>
                      {s.lastError && (
                        <p className="max-w-[220px] truncate text-[11px] text-muted-foreground" title={s.lastError}>
                          {s.lastError}
                        </p>
                      )}
                    </div>
                  </TD>
                  <TD className="max-w-xs truncate font-mono text-xs">{s.url}</TD>
                  <TD><Badge variant="secondary">{s.protocol}</Badge></TD>
                  <TD>
                    {s.pool ? (
                      <Badge variant="outline" className="text-[10px]">{s.pool}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </TD>
                  <TD>
                    <Switch
                      checked={s.enabled}
                      onCheckedChange={(v) => toggle.mutate({ id: s.id, enabled: v })}
                    />
                  </TD>
                  <TD className="flex justify-end gap-1">
                    {(s.failCount > 0 || !s.enabled) && (
                      <Button variant="ghost" size="icon" onClick={() => resetFail(s.id)} title={t('scraper.resetFail')}>
                        <RotateCcw className="h-4 w-4 text-amber-500" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => test(s.id)} title={t('scraper.test')}>
                      <FlaskConical className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(s)} title={t('common.edit')}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={async () => {
                        const ok = await confirmDialog({ title: t('common.delete'), description: t('common.confirmDelete'), destructive: true });
                        if (ok) del.mutate(s.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TD>
                </TR>
              ))}
              {!paged.length && (
                <TR><TD colSpan={7} className="py-8 text-center text-muted-foreground">{search ? t('common.noResults') : t('common.none')}</TD></TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {filtered.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {t('scraper.totalCount').replace('{n}', String(filtered.length))}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={safePage === 1} onClick={() => setPage((p) => p - 1)} className="h-8 gap-1">
              <ChevronLeft className="h-3.5 w-3.5" /> {t('common.previous')}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t('common.page')} <span className="font-semibold">{safePage}</span> / {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)} className="h-8 gap-1">
              {t('common.next')} <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
      {editing && (
        <EditDialog source={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); invalidate(); }} />
      )}

      <Dialog open={liveOpen} onOpenChange={setLiveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              {t('scraper.liveStats')}
            </DialogTitle>
          </DialogHeader>
          {!liveStatus ? (
            <p className="text-sm text-muted-foreground">{t('app.loading')}</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  {liveStatus.running ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-sky-500" />
                    </>
                  ) : (
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                  )}
                </span>
                <span className="font-semibold">
                  {liveStatus.running ? t('scraper.running') : t('scraper.idle')}
                </span>
                <Badge variant={liveStatus.loopEnabled ? 'default' : 'outline'} className="text-[10px]">
                  {liveStatus.loopEnabled ? t('scraper.loopOn') : t('scraper.loopOff')}
                </Badge>
              </div>

              {liveStatus.running && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-muted-foreground">
                      {t('scraper.sourcesProgress')} : {liveStatus.sourcesDone} / {liveStatus.sourcesTotal}
                    </span>
                    <span className="font-semibold text-primary">
                      {liveStatus.sourcesTotal > 0 ? Math.round((liveStatus.sourcesDone / liveStatus.sourcesTotal) * 100) : 0}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-violet-500 transition-all duration-500 ease-out"
                      style={{ width: `${liveStatus.sourcesTotal > 0 ? (liveStatus.sourcesDone / liveStatus.sourcesTotal) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">
                    {t('scraper.itemsCollected')} : {liveStatus.itemsCollected.toLocaleString()}
                  </p>
                </div>
              )}

              <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">{t('scraper.lastRun')}</p>
                <p>{liveStatus.lastRun ? new Date(liveStatus.lastRun).toLocaleString() : '—'}</p>
                {liveStatus.lastRun && (
                  <p>
                    {(liveStatus.lastRunDurationMs / 1000).toFixed(1)}s · {liveStatus.lastRunCollected.toLocaleString()} {t('scraper.uniqueProxies')}
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditDialog({ source, onClose, onSaved }: { source: Source; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const [form, setForm] = useState({ name: source.name, url: source.url, protocol: source.protocol, pattern: source.pattern ?? '', pool: source.pool ?? '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const { data: pools } = useQuery({
    queryKey: ['proxy-pools'],
    queryFn: async () => (await api.get('/proxy-pools')).data.data as { id: string; name: string }[],
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.patch(`/scraper-sources/${source.id}`, {
        name: form.name,
        url: form.url,
        protocol: form.protocol,
        pattern: form.pattern || undefined,
        pool: form.pool || null,
      });
      onSaved();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t('scraper.editTitle')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('scraper.name')}</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>{t('scraper.url')}</Label>
            <Input value={form.url} onChange={(e) => set('url', e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>{t('scraper.protocol')}</Label>
            <select value={form.protocol} onChange={(e) => set('protocol', e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="auto">{t('scraper.protocolAuto')}</option>
              <option value="http">http</option>
              <option value="socks4">socks4</option>
              <option value="socks5">socks5</option>
            </select>
          </div>
          <PatternField url={form.url} value={form.pattern} onChange={(v) => set('pattern', v)} />
          <div className="space-y-1.5">
            <Label>{t('pools.assign')}</Label>
            <select value={form.pool} onChange={(e) => set('pool', e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">{t('pools.noPool')}</option>
              {pools?.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={loading}>{t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateDialog({ onCreated }: { onCreated: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', protocol: 'http', pattern: '', pool: '' });
  const [error, setError] = useState('');
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const { data: pools } = useQuery({
    queryKey: ['proxy-pools'],
    queryFn: async () => (await api.get('/proxy-pools')).data.data as { id: string; name: string }[],
    enabled: open,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/scraper-sources', {
        name: form.name,
        url: form.url,
        protocol: form.protocol,
        pattern: form.pattern || undefined,
        pool: form.pool || undefined,
      });
      setOpen(false);
      setForm({ name: '', url: '', protocol: 'http', pattern: '', pool: '' });
      onCreated();
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> {t('scraper.create')}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t('scraper.create')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('scraper.name')}</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={t('scraper.namePlaceholder')} required />
          </div>
          <div className="space-y-1.5">
            <Label>{t('scraper.url')}</Label>
            <Input value={form.url} onChange={(e) => set('url', e.target.value)} required placeholder={t('scraper.urlPlaceholder')} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('scraper.protocol')}</Label>
            <select
              value={form.protocol}
              onChange={(e) => set('protocol', e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="auto">{t('scraper.protocolAuto')}</option>
              <option value="http">http</option>
              <option value="socks4">socks4</option>
              <option value="socks5">socks5</option>
            </select>
          </div>
          <PatternField url={form.url} value={form.pattern} onChange={(v) => set('pattern', v)} />
          <div className="space-y-1.5">
            <Label>{t('pools.assign')}</Label>
            <select value={form.pool} onChange={(e) => set('pool', e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">{t('pools.noPool')}</option>
              {pools?.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button type="submit">{t('common.create')}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PatternField({ url, value, onChange }: { url: string; value: string; onChange: (v: string) => void }) {
  const t = useT();
  const [detecting, setDetecting] = useState(false);
  const [hint, setHint] = useState('');

  const detect = async () => {
    if (!url) return;
    setDetecting(true);
    setHint('');
    try {
      const { data } = await api.post('/scraper-sources/detect-pattern', { url });
      if (data.status === 'success') {
        onChange(data.pattern);
        setHint(t('scraper.patternDetected'));
      } else {
        setHint(`✗ ${data.message}`);
      }
    } catch (e) {
      setHint(`✗ ${apiError(e)}`);
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{t('scraper.pattern')}</Label>
        <button
          type="button"
          onClick={detect}
          disabled={detecting || !url}
          className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-40 disabled:no-underline"
        >
          <Wand2 className="h-3 w-3" />
          {detecting ? t('scraper.detecting') : t('scraper.detectPattern')}
        </button>
      </div>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={t('scraper.patternPlaceholder')} />
      {hint && (
        <p className={`text-xs ${hint.startsWith('✗') ? 'text-destructive' : 'text-emerald-500'}`}>{hint}</p>
      )}
    </div>
  );
}

function urlToName(raw: string): string {
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^(www|api|raw|cdn|dl|mirror|proxy|list)\./i, '');
    const parts = host.split('.');
    const domain = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  } catch {
    return raw.slice(0, 40);
  }
}

function BulkCreateDialog({ onCreated }: { onCreated: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [protocol, setProtocol] = useState('auto');
  const [pool, setPool] = useState('');
  const [pattern, setPattern] = useState('');
  const [status, setStatus] = useState<{ done: number; total: number; errors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: pools } = useQuery({
    queryKey: ['proxy-pools'],
    queryFn: async () => (await api.get('/proxy-pools')).data.data as { id: string; name: string }[],
    enabled: open,
  });

  const urls = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urls.length) return;
    setBusy(true);
    setStatus({ done: 0, total: urls.length, errors: [] });
    const errors: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        await api.post('/scraper-sources', {
          name: urlToName(url),
          url,
          protocol,
          pattern: pattern || undefined,
          pool: pool || undefined,
        });
      } catch (err) {
        errors.push(`${urlToName(url)}: ${apiError(err)}`);
      }
      setStatus({ done: i + 1, total: urls.length, errors: [...errors] });
    }
    setBusy(false);
    onCreated();
    if (!errors.length) {
      setTimeout(() => { setOpen(false); setText(''); setStatus(null); }, 1200);
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (!busy) { setOpen(v); if (!v) { setText(''); setStatus(null); } }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Layers className="h-4 w-4" /> {t('scraper.bulkCreate')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('scraper.bulkCreate')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              required
              placeholder={t('scraper.bulkPlaceholder')}
              className="w-full rounded-md border border-input bg-background/50 px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">{t('scraper.bulkHint')}</p>
            {urls.length > 0 && (
              <p className="text-xs font-medium text-primary">{urls.length} URL{urls.length > 1 ? 's' : ''} détectée{urls.length > 1 ? 's' : ''}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{t('scraper.protocol')} — {t('scraper.applyToAll')}</Label>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="auto">{t('scraper.protocolAuto')}</option>
                <option value="http">http</option>
                <option value="socks4">socks4</option>
                <option value="socks5">socks5</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{t('pools.assign')} — {t('scraper.applyToAll')}</Label>
              <select
                value={pool}
                onChange={(e) => setPool(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{t('pools.noPool')}</option>
                {pools?.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">{t('scraper.pattern')} — {t('scraper.applyToAll')}</Label>
            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={t('scraper.patternPlaceholder')}
            />
          </div>

          {status && (
            <div className="space-y-1.5">
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-200"
                  style={{ width: `${(status.done / status.total) * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {busy ? t('scraper.bulkAdding') : ''} {status.done}/{status.total}
                {!busy && status.errors.length === 0 && (
                  <span className="ml-1 text-emerald-500 font-medium">— {status.total} {t('scraper.bulkDone')}</span>
                )}
                {!busy && status.errors.length > 0 && (
                  <span className="ml-1 text-destructive font-medium">— {status.errors.length} {t('scraper.bulkErrors')}</span>
                )}
              </p>
              {status.errors.length > 0 && (
                <ul className="text-xs text-destructive space-y-0.5 max-h-24 overflow-y-auto">
                  {status.errors.map((e, i) => <li key={i}>• {e}</li>)}
                </ul>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy || urls.length === 0}>
              <Plus className="h-4 w-4" />
              {busy ? t('scraper.bulkAdding') : `${t('scraper.bulkCreate')} (${urls.length})`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
