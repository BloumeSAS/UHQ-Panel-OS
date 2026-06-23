import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, List, Pencil, Activity, Download, RefreshCw, Zap } from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { formatBytes } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@/components/ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/dialog';

interface MyProxy {
  id: string;
  username: string;
  password: string;
  label: string;
  threads_limit: number;
  country_filter: string | null;
  is_blocked: boolean;
  bytes_sent: number;
  bytes_received: number;
  allowed_ips: string | null;
  port: number | null;
  domain: string | null;
  effective_host: string;
  effective_port: string;
}

export default function MyProxies() {
  const t = useT();
  const qc = useQueryClient();

  const { data, refetch } = useQuery({
    queryKey: ['me-proxies'],
    queryFn: async () => (await api.get('/me/proxies')).data.data as MyProxy[],
  });

  const [generatorFor, setGeneratorFor] = useState<MyProxy | null>(null);
  const [statsFor, setStatsFor] = useState<MyProxy | null>(null);
  const [editFor, setEditFor] = useState<MyProxy | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['me-proxies'] });
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('me.title')}</h1>
        <Button variant="outline" size="sm" onClick={() => invalidate()}>
          <RefreshCw className="h-4 w-4 mr-2" /> {t('common.refresh')}
        </Button>
      </div>

      {data && !data.length && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t('me.noProxies')}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {data?.map((p) => (
          <Card key={p.id} className="relative overflow-hidden border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b">
              <CardTitle className="text-base font-semibold truncate">{p.label}</CardTitle>
              {p.is_blocked ? (
                <Badge variant="destructive">{t('sub.blocked')}</Badge>
              ) : (
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
                  Actif
                </Badge>
              )}
            </CardHeader>
            <CardContent className="pt-4 space-y-4 text-sm">
              <div className="space-y-2">
                <Row label={t('sub.username')} value={p.username} copyable />
                <Row label={t('sub.password')} value={p.password} copyable />
                <Row label={t('me.connection')} value={`${p.effective_host}:${p.effective_port}`} copyable />
                <Row label={t('sub.threads')} value={`${p.threads_limit}`} />
                <Row label={t('sub.country')} value={p.country_filter || '—'} />
                <Row label={t('sub.ipWhitelist')} value={p.allowed_ips || '—'} />
                {p.domain && <Row label={t('me.dedicatedDomain')} value={p.domain} copyable />}
                {p.port && <Row label={t('me.dedicatedPort')} value={String(p.port)} copyable />}
                <Row label={t('me.usage')} value={formatBytes(p.bytes_sent + p.bytes_received)} />
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setGeneratorFor(p)}
                  title={t('me.generatorTitle')}
                  className="flex flex-col h-auto py-2 px-1 text-xs gap-1"
                >
                  <List className="h-4 w-4 text-primary" />
                  Générer
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStatsFor(p)}
                  title={t('me.statsTitle')}
                  className="flex flex-col h-auto py-2 px-1 text-xs gap-1"
                >
                  <Activity className="h-4 w-4 text-orange-500" />
                  Stats
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditFor(p)}
                  title={t('me.editTitle')}
                  className="flex flex-col h-auto py-2 px-1 text-xs gap-1"
                >
                  <Pencil className="h-4 w-4 text-blue-500" />
                  Modifier
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stats Dialog */}
      {statsFor && (
        <StatsDialog proxy={statsFor} onClose={() => setStatsFor(null)} />
      )}

      {/* Edit Settings Dialog */}
      {editFor && (
        <EditDialog
          proxy={editFor}
          onClose={() => setEditFor(null)}
          onSaved={() => {
            setEditFor(null);
            invalidate();
          }}
        />
      )}

      {/* Generator Dialog */}
      {generatorFor && (
        <GeneratorDialog proxy={generatorFor} onClose={() => setGeneratorFor(null)} />
      )}
    </div>
  );
}

function Row({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="flex items-center gap-1 font-mono text-xs font-medium text-foreground">
        {value}
        {copyable && value !== '—' && (
          <button
            onClick={() => {
              navigator.clipboard.writeText(value);
              toast.success('Copié !');
            }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Copy className="h-3 w-3" />
          </button>
        )}
      </span>
    </div>
  );
}

// ─── Sub-Dialogs ─────────────────────────────────────────────────────────────

function EditDialog({
  proxy,
  onClose,
  onSaved,
}: {
  proxy: MyProxy;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [form, setForm] = useState({
    password: '',
    country_filter: proxy.country_filter || '',
    allowed_ips: proxy.allowed_ips || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.patch(`/me/proxies/${proxy.id}`, {
        password: form.password || undefined,
        country_filter: form.country_filter || null,
        allowed_ips: form.allowed_ips || null,
      });
      toast.success(t('settings.saved'));
      onSaved();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('me.editTitle')} — {proxy.label}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('me.rotatePassword')}</Label>
            <Input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Laisser vide pour ne pas modifier"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('sub.country')}</Label>
            <Input
              value={form.country_filter}
              onChange={(e) => setForm({ ...form, country_filter: e.target.value })}
              placeholder="FR, DE, US..."
            />
            <p className="text-xs text-muted-foreground">Filtres de pays upstreams séparés par des virgules.</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t('sub.ipWhitelist')}</Label>
            <Input
              value={form.allowed_ips}
              onChange={(e) => setForm({ ...form, allowed_ips: e.target.value })}
              placeholder="1.2.3.4, 5.6.7.8"
            />
            <p className="text-xs text-muted-foreground">IP autorisées sans mot de passe.</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatsDialog({ proxy, onClose }: { proxy: MyProxy; onClose: () => void }) {
  const t = useT();
  const [period, setPeriod] = useState<'week' | 'month' | 'year' | 'all'>('week');

  const { data: stats, isLoading } = useQuery({
    queryKey: ['me-proxies-usage', proxy.id, period],
    queryFn: async () => (await api.get(`/me/proxies/${proxy.id}/usage?period=${period}`)).data,
  });

  const usage = stats?.usage ?? [];
  const totalStats = stats?.total_stats;

  // Group requests by hostname
  const domainsMap = new Map<string, number>();
  for (const r of usage) {
    domainsMap.set(r.hostname, (domainsMap.get(r.hostname) || 0) + r.requests);
  }
  const topDomains = Array.from(domainsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Group traffic by date
  const dailyMap = new Map<string, number>();
  for (const r of usage) {
    const day = new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    dailyMap.set(day, (dailyMap.get(day) || 0) + (r.bytesSent + r.bytesReceived));
  }
  const dailyTraffic = Array.from(dailyMap.entries()).reverse();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('me.statsTitle')} — {proxy.label}</DialogTitle>
        </DialogHeader>

        <div className="flex justify-end gap-1 mb-2">
          {['week', 'month', 'year', 'all'].map((p) => (
            <Button
              key={p}
              variant={period === p ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod(p as any)}
              className="text-xs capitalize"
            >
              {t(`reports.period${p.charAt(0).toUpperCase() + p.slice(1)}`)}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            {t('app.loading')}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-xl font-bold">{totalStats?.active_threads ?? 0}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {t('dash.activeThreads')}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-xl font-bold">{totalStats?.requests ?? 0}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {t('reports.requests')}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-xl font-bold truncate">
                    {typeof totalStats?.totalGb === 'number' ? totalStats.totalGb.toFixed(3) : '—'}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Trafic (Go)
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Daily Traffic Chart */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-orange-500" />
                Trafic quotidien
              </h3>
              <Card className="p-4">
                <TrafficChart data={dailyTraffic} />
              </Card>
            </div>

            {/* Top Domains */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">
                {t('dash.topDomains')}
              </h3>
              <Card className="p-4">
                <DomainList data={topDomains} />
              </Card>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TrafficChart({ data }: { data: [string, number][] }) {
  if (data.length === 0) {
    return <div className="text-center py-10 text-muted-foreground text-sm">— Aucune donnée ─</div>;
  }
  const max = Math.max(...data.map(([, v]) => v), 1);
  return (
    <div className="flex items-end justify-between gap-2 h-32 pt-6 px-1 border-b">
      {data.map(([date, val]) => {
        const heightPct = (val / max) * 100;
        return (
          <div key={date} className="flex-1 flex flex-col items-center group relative min-w-0">
            <div className="absolute bottom-full mb-1 hidden group-hover:block bg-popover border text-popover-foreground text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap shadow-md z-10">
              {formatBytes(val)}
            </div>
            <div
              className="w-full bg-primary rounded-t transition-all hover:bg-primary/80"
              style={{ height: `${Math.max(4, heightPct)}%` }}
            />
            <span className="text-[8px] text-muted-foreground mt-1 truncate w-full text-center">
              {date}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DomainList({ data }: { data: [string, number][] }) {
  if (!data.length) return <p className="text-sm text-muted-foreground text-center py-4">—</p>;
  const max = Math.max(...data.map(([, v]) => v), 1);
  return (
    <div className="space-y-3">
      {data.map(([k, v]) => (
        <div key={k} className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="truncate font-medium">{k}</span>
            <span className="text-muted-foreground font-mono text-[11px]">{v} req</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(v / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function GeneratorDialog({ proxy, onClose }: { proxy: MyProxy; onClose: () => void }) {
  const t = useT();
  const [count, setCount] = useState(100);
  const [protocol, setProtocol] = useState<'none' | 'http://' | 'socks5://'>('none');
  const [format, setFormat] = useState('{host}:{port}:{username}:{password}');
  const [proxies, setProxies] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

  const presets = [
    { label: 'Rotatif Standard (host:port:user:pass)', value: '{host}:{port}:{username}:{password}' },
    { label: 'Rotatif @ (user:pass@host:port)', value: '{username}:{password}@{host}:{port}' },
    { label: 'Rotatif HTTP URI', value: 'http://{username}:{password}@{host}:{port}', overrideProto: true },
    { label: 'Rotatif SOCKS5 URI', value: 'socks5://{username}:{password}@{host}:{port}', overrideProto: true },
    { label: 'Sticky Standard (host:port:user:session:pass)', value: '{host}:{port}:{username}:{session}:{password}' },
    { label: 'Sticky @ (user-session-session:pass@host:port)', value: '{username}-session-{session}:{password}@{host}:{port}' },
    { label: 'Sticky HTTP URI', value: 'http://{username}-session-{session}:{password}@{host}:{port}', overrideProto: true },
    { label: 'Sticky SOCKS5 URI', value: 'socks5://{username}-session-{session}:{password}@{host}:{port}', overrideProto: true },
    { label: 'Host:Port seulement', value: '{host}:{port}' },
  ];

  const generate = async () => {
    setGenerating(true);
    try {
      const isSticky = format.includes('{session}') || format.includes('session');
      const fetchCount = isSticky ? count : 1;
      const { data } = await api.get(`/me/proxies/${proxy.id}/sticky-list?count=${fetchCount}`);
      const rawLines = data.proxies as string[];
      const formatted = rawLines.map((line) => {
        const parts = line.split(':');
        if (parts.length < 5) return line;
        const [host, port, username, session, password] = parts;

        let out = format;
        out = out.replace(/{host}/g, host);
        out = out.replace(/{port}/g, port);
        out = out.replace(/{username}/g, username);
        out = out.replace(/{session}/g, session);
        out = out.replace(/{password}/g, password);

        // Prepend protocol if enabled and not already overridden by template
        const activePreset = presets.find((p) => p.value === format);
        if (protocol !== 'none' && !activePreset?.overrideProto) {
          return `${protocol}${out}`;
        }
        return out;
      });
      setProxies(formatted);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setGenerating(false);
    }
  };

  const copyAll = () => {
    if (!proxies.length) return;
    navigator.clipboard.writeText(proxies.join('\n'));
    toast.success('Liste copiée avec succès !');
  };

  const downloadTxt = () => {
    if (!proxies.length) return;
    const blob = new Blob([proxies.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${proxy.label}_proxies.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('me.generatorTitle')} — {proxy.label}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Presets */}
          <div className="space-y-1.5">
            <Label>{t('me.formatSelect')}</Label>
            <select
              value={format}
              onChange={(e) => {
                const val = e.target.value;
                setFormat(val);
                const p = presets.find((x) => x.value === val);
                if (p?.overrideProto) setProtocol('none');
              }}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {presets.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Format personnalisé...</option>
            </select>
          </div>

          {format === 'custom' && (
            <div className="space-y-1.5">
              <Label>Template personnalisé</Label>
              <Input
                value={format === 'custom' ? '' : format}
                onChange={(e) => setFormat(e.target.value)}
                placeholder="{host}:{port}@{username}:{password}"
              />
              <p className="text-[10px] text-muted-foreground">
                Variables supportées : <code className="bg-muted px-1 rounded">{'{host}'}</code>,{' '}
                <code className="bg-muted px-1 rounded">{'{port}'}</code>,{' '}
                <code className="bg-muted px-1 rounded">{'{username}'}</code>,{' '}
                <code className="bg-muted px-1 rounded">{'{session}'}</code>,{' '}
                <code className="bg-muted px-1 rounded">{'{password}'}</code>
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Protocol */}
            <div className="space-y-1.5">
              <Label>{t('me.protocolSelect')}</Label>
              <select
                value={protocol}
                disabled={presets.find((x) => x.value === format)?.overrideProto}
                onChange={(e) => setProtocol(e.target.value as any)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="none">Aucun (None)</option>
                <option value="http://">http://</option>
                <option value="socks5://">socks5://</option>
              </select>
            </div>

            {/* Quantity */}
            <div className="space-y-1.5">
              <Label>Quantité</Label>
              {format.includes('{session}') || format.includes('session') || format === 'custom' ? (
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(1000, parseInt(e.target.value) || 100)))}
                />
              ) : (
                <div className="h-9 flex items-center px-3 border border-dashed rounded bg-muted/40 text-xs font-semibold text-orange-600 dark:text-orange-400">
                  Rotatif (1 ligne unique)
                </div>
              )}
            </div>
          </div>

          <Button onClick={generate} disabled={generating} className="w-full">
            {generating ? 'Génération en cours...' : 'Générer la liste'}
          </Button>

          {proxies.length > 0 && (
            <div className="space-y-3 pt-2 border-t">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold">{proxies.length} proxies générés</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={copyAll}>
                    <Copy className="h-4 w-4 mr-1.5" /> Copier
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadTxt}>
                    <Download className="h-4 w-4 mr-1.5" /> {t('me.download')}
                  </Button>
                </div>
              </div>
              <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 text-[10px] font-mono leading-relaxed select-all">
                {proxies.join('\n')}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
