import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Copy, List, Pencil, Activity, Download, RefreshCw, Zap, Code2, LifeBuoy, Search, Eye, EyeOff,
  Server, CheckCircle2, Gauge, CalendarClock, Clock, Hourglass, Ban,
} from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { addonApi } from '@/lib/addonApi';
import { useT } from '@/lib/i18n';
import { formatBytes } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { fillText } from '@/lib/diagMessage';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
} from '@/components/ui';
import { ConnectionDialog } from '@/components/ConnectionDialog';
import { FailuresDialog } from '@/components/FailuresDialog';
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
  traffic_limit: number | null;
  bandwidth_limit: number | null;
  expires_at: string | null;
  country_filter: string | null;
  is_blocked: boolean;
  bytes_sent: number;
  bytes_received: number;
  allowed_ips: string | null;
  port: number | null;
  domain: string | null;
  blocked_domains: string | null;
  effective_host: string;
  effective_port: string;
}

interface PendingApproval {
  order_id: string;
  created_at: string;
  items: { name: string; quantity: number }[];
}

type Filter = 'all' | 'active' | 'blocked' | 'expiring';
type State = 'active' | 'blocked' | 'expired' | 'expiring' | 'quota';

const DAY = 86_400_000;
const EXPIRING_SOON = 7 * DAY;

/** État lisible d'un compte (le blocage prime, puis l'expiration, puis le quota). */
function stateOf(p: MyProxy, now: number): State {
  if (p.is_blocked) return 'blocked';
  const used = p.bytes_sent + p.bytes_received;
  if (p.expires_at) {
    const left = new Date(p.expires_at).getTime() - now;
    if (left <= 0) return 'expired';
    if (p.traffic_limit && used >= p.traffic_limit) return 'quota';
    if (left <= EXPIRING_SOON) return 'expiring';
  } else if (p.traffic_limit && used >= p.traffic_limit) return 'quota';
  return 'active';
}

const STATE_STYLE: Record<State, string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400',
  expiring: 'bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400',
  quota: 'bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400',
  expired: 'bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400',
  blocked: 'bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400',
};

export default function MyProxies() {
  const t = useT();
  const qc = useQueryClient();

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['me-proxies'],
    queryFn: async () => (await api.get('/me/proxies')).data.data as MyProxy[],
  });

  // Commandes payées en attente de validation (addon Orders) : affichées sans aucun accès — les comptes n'existent pas encore.
  const { data: addons } = useQuery({
    queryKey: ['addons'],
    queryFn: async () => {
      try { return (await api.get('/addons')).data.data as any[]; } catch { return [] as any[]; }
    },
  });
  const ordersActive = (addons ?? []).some((a) => a.baseUrl === '/addon-proxy/orders' && a.enabled !== false);
  const { data: pending } = useQuery({
    queryKey: ['me-pending-approvals'],
    enabled: ordersActive,
    refetchInterval: 30_000,
    retry: false,
    queryFn: async () => {
      try { return (await addonApi.get('/orders/api/pending-approvals')).data.pending as PendingApproval[]; } catch { return [] as PendingApproval[]; }
    },
  });

  const [generatorFor, setGeneratorFor] = useState<MyProxy | null>(null);
  const [connFor, setConnFor] = useState<MyProxy | null>(null);
  const [failFor, setFailFor] = useState<MyProxy | null>(null);
  const [statsFor, setStatsFor] = useState<MyProxy | null>(null);
  const [editFor, setEditFor] = useState<MyProxy | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['me-proxies'] });
    qc.invalidateQueries({ queryKey: ['me-pending-approvals'] });
    refetch();
  };

  const now = Date.now();
  const list = data ?? [];
  const summary = useMemo(() => {
    const states = list.map((p) => stateOf(p, now));
    return {
      total: list.length,
      active: states.filter((s) => s === 'active' || s === 'expiring').length,
      used: list.reduce((acc, p) => acc + p.bytes_sent + p.bytes_received, 0),
      expiring: states.filter((s) => s === 'expiring').length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const visible = list.filter((p) => {
    const q = search.trim().toLowerCase();
    if (q && !p.label.toLowerCase().includes(q) && !p.username.toLowerCase().includes(q)) return false;
    const st = stateOf(p, now);
    if (filter === 'active') return st === 'active' || st === 'expiring';
    if (filter === 'blocked') return st === 'blocked' || st === 'expired' || st === 'quota';
    if (filter === 'expiring') return st === 'expiring' || st === 'expired';
    return true;
  });

  const pendingList = pending ?? [];
  const empty = !isLoading && list.length === 0 && pendingList.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('me.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('me.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => invalidate()}>
          <RefreshCw className="h-4 w-4 mr-2" /> {t('common.refresh')}
        </Button>
      </div>

      {list.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={Server} label={t('me.statAccounts')} value={String(summary.total)} />
          <StatCard icon={CheckCircle2} label={t('me.statActive')} value={String(summary.active)} tone="good" />
          <StatCard icon={Gauge} label={t('me.statUsage')} value={formatBytes(summary.used)} />
          <StatCard icon={CalendarClock} label={t('me.statExpiring')} value={String(summary.expiring)} tone={summary.expiring > 0 ? 'warn' : undefined} />
        </div>
      )}

      {pendingList.length > 0 && (
        <div className="space-y-3" data-testid="pending-approvals">
          {pendingList.map((o) => (
            <Card key={o.order_id} className="border-dashed border-amber-300 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/10">
              <CardContent className="flex items-start gap-3 p-4">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                  <Hourglass className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm">{t('me.pendingTitle')}</span>
                    <Badge variant="secondary" className={STATE_STYLE.expiring}>{t('me.pendingBadge')}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('me.pendingText')}</p>
                  <ul className="flex flex-wrap gap-1.5 pt-1">
                    {o.items.map((it, i) => (
                      <li key={i} className="rounded-md border bg-background px-2 py-0.5 text-xs">{it.quantity} × {it.name}</li>
                    ))}
                  </ul>
                  <p className="flex items-center gap-1 pt-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {fillText(t('me.pendingSince'), { d: new Date(o.created_at).toLocaleString() })}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {list.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('me.search')} className="pl-8" aria-label={t('me.search')} />
          </div>
          <div className="inline-flex rounded-md border p-0.5" role="group" aria-label={t('me.filter')}>
            {(['all', 'active', 'expiring', 'blocked'] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {t(`me.filter.${f}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {empty && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><Server className="h-5 w-5" /></span>
            <p className="font-medium">{t('me.emptyTitle')}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t('me.noProxies')}</p>
          </CardContent>
        </Card>
      )}

      {list.length > 0 && visible.length === 0 && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{t('me.noMatch')}</CardContent></Card>
      )}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((p) => (
          <AccountCard
            key={p.id}
            proxy={p}
            now={now}
            onConnection={() => setConnFor(p)}
            onHelp={() => setFailFor(p)}
            onGenerate={() => setGeneratorFor(p)}
            onStats={() => setStatsFor(p)}
            onEdit={() => setEditFor(p)}
          />
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
      {generatorFor && <GeneratorDialog proxy={generatorFor} onClose={() => setGeneratorFor(null)} />}
      <FailuresDialog target={failFor ? { mode: 'me', id: failFor.id, username: failFor.username, label: failFor.label } : null} onClose={() => setFailFor(null)} />
      <ConnectionDialog
        info={connFor ? { host: connFor.effective_host, port: connFor.effective_port, username: connFor.username, password: connFor.password, label: connFor.label } : null}
        onClose={() => setConnFor(null)}
      />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: typeof Server; label: string; value: string; tone?: 'good' | 'warn' }) {
  const toneCls = tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-primary';
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted ${toneCls}`}><Icon className="h-4 w-4" /></span>
        <div className="min-w-0">
          <div className="text-xs leading-tight text-muted-foreground">{label}</div>
          <div className="truncate text-lg font-semibold leading-tight">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountCard({
  proxy: p, now, onConnection, onHelp, onGenerate, onStats, onEdit,
}: {
  proxy: MyProxy; now: number;
  onConnection: () => void; onHelp: () => void; onGenerate: () => void; onStats: () => void; onEdit: () => void;
}) {
  const t = useT();
  const [reveal, setReveal] = useState(false);
  const st = stateOf(p, now);
  const used = p.bytes_sent + p.bytes_received;
  const pct = p.traffic_limit ? Math.min(100, (used / p.traffic_limit) * 100) : 0;
  const bar = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-primary';
  const expiry = p.expires_at ? new Date(p.expires_at) : null;
  const daysLeft = expiry ? Math.ceil((expiry.getTime() - now) / DAY) : null;
  const connection = `${p.effective_host}:${p.port ?? p.effective_port}`;

  return (
    <Card className={`relative flex flex-col overflow-hidden ${st === 'blocked' || st === 'expired' ? 'opacity-90' : ''}`}>
      <div className="flex items-start justify-between gap-2 border-b p-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{p.label}</h3>
          <p className="truncate font-mono text-[11px] text-muted-foreground">{p.username}</p>
        </div>
        <Badge variant="secondary" className={STATE_STYLE[st]}>
          {st === 'blocked' && <Ban className="mr-1 h-3 w-3" />}
          {t(`me.state.${st}`)}
        </Badge>
      </div>

      <CardContent className="flex-1 space-y-4 p-4 text-sm">
        {/* Bande passante */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">{t('me.traffic')}</span>
            <span className="font-medium">
              {formatBytes(used)}{' '}
              <span className="text-muted-foreground">/ {p.traffic_limit ? formatBytes(p.traffic_limit) : t('me.unlimited')}</span>
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
            <div className={`h-2 rounded-full transition-all ${p.traffic_limit ? bar : 'bg-primary/30'}`} style={{ width: p.traffic_limit ? `${Math.max(2, pct)}%` : '100%' }} />
          </div>
        </div>

        {/* Caractéristiques */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <Fact label={t('sub.threads')} value={p.threads_limit > 0 ? String(p.threads_limit) : t('me.unlimited')} />
          <Fact label={t('me.speed')} value={p.bandwidth_limit ? `${p.bandwidth_limit} ${t('me.kbps')}` : t('me.unlimited')} />
          <Fact label={t('sub.country')} value={p.country_filter || t('me.anyCountry')} />
          <Fact
            label={t('me.expiry')}
            value={expiry ? `${expiry.toLocaleDateString()}${daysLeft !== null && daysLeft > 0 ? ` · ${fillText(t('me.daysLeft'), { n: String(daysLeft) })}` : ''}` : t('me.noExpiry')}
            tone={st === 'expired' ? 'bad' : st === 'expiring' ? 'warn' : undefined}
          />
        </dl>

        {/* Accès */}
        <div className="space-y-1 rounded-lg border bg-muted/30 p-2.5">
          <Row label={t('me.connection')} value={connection} copyable />
          <Row label={t('sub.username')} value={p.username} copyable />
          <div className="flex items-center justify-between gap-2 py-0.5">
            <span className="text-xs text-muted-foreground">{t('sub.password')}</span>
            <span className="flex items-center gap-1.5 font-mono text-xs font-medium">
              {reveal ? p.password : '••••••••••'}
              <button type="button" onClick={() => setReveal((v) => !v)} className="text-muted-foreground transition-colors hover:text-foreground" aria-label={reveal ? t('me.hidePassword') : t('me.showPassword')}>
                {reveal ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
              <button type="button" onClick={() => { void navigator.clipboard.writeText(p.password); toast.success(t('me.copied')); }} className="text-muted-foreground transition-colors hover:text-foreground" aria-label={t('common.copy')}>
                <Copy className="h-3 w-3" />
              </button>
            </span>
          </div>
          {p.domain && <Row label={t('me.dedicatedDomain')} value={p.domain} copyable />}
          {p.allowed_ips && <Row label={t('sub.ipWhitelist')} value={p.allowed_ips} />}
          {p.blocked_domains && <Row label={t('sub.blockedDomains')} value={p.blocked_domains} />}
        </div>
      </CardContent>

      <div className="grid grid-cols-3 gap-1.5 border-t p-3 sm:grid-cols-5">
        <ActionBtn icon={Code2} label={t('conn.title')} title={t('conn.btn')} color="text-emerald-500" onClick={onConnection} />
        <ActionBtn icon={LifeBuoy} label={t('nav.help')} title={t('fail.btn')} color="text-amber-500" onClick={onHelp} />
        <ActionBtn icon={List} label={t('me.generate')} title={t('me.generatorTitle')} color="text-primary" onClick={onGenerate} />
        <ActionBtn icon={Activity} label={t('me.stats')} title={t('me.statsTitle')} color="text-orange-500" onClick={onStats} />
        <ActionBtn icon={Pencil} label={t('me.modify')} title={t('me.editTitle')} color="text-blue-500" onClick={onEdit} />
      </div>
    </Card>
  );
}

function ActionBtn({ icon: Icon, label, title, color, onClick }: { icon: typeof Server; label: string; title: string; color: string; onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} title={title} className="flex h-auto flex-col gap-1 px-1 py-2 text-[11px]">
      <Icon className={`h-4 w-4 ${color}`} />
      <span className="max-w-full truncate">{label}</span>
    </Button>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'bad' }) {
  const cls = tone === 'bad' ? 'text-red-600 dark:text-red-400' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-foreground';
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`truncate font-medium ${cls}`}>{value}</dd>
    </div>
  );
}

function Row({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs font-medium text-foreground">
        <span className="truncate">{value}</span>
        {copyable && value !== '—' && (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(value);
              toast.success(t('me.copied'));
            }}
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={t('common.copy')}
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
    blocked_domains: proxy.blocked_domains ? proxy.blocked_domains.split(',').map((s) => s.trim()).filter(Boolean).join('\n') : '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const blockedDomainsCsv = form.blocked_domains.split(/[\n,]/).map((s) => s.trim()).filter(Boolean).join(',');
      await api.patch(`/me/proxies/${proxy.id}`, {
        password: form.password || undefined,
        country_filter: form.country_filter || null,
        allowed_ips: form.allowed_ips || null,
        blocked_domains: blockedDomainsCsv || null,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
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
          <div className="space-y-1.5">
            <Label>{t('sub.blockedDomains')}</Label>
            <textarea
              value={form.blocked_domains}
              onChange={(e) => setForm({ ...form, blocked_domains: e.target.value })}
              rows={3}
              placeholder={'exemple.com\nautre-site.net'}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">{t('sub.blockedDomainsHint')}</p>
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

  // Agrégats calculés côté serveur sur toute la période (`daily`,
  // `top_domains`) ; repli sur les lignes brutes pour une API plus ancienne.
  let topDomains: [string, number][];
  let dailyTraffic: [string, number][];
  const dayLabel = (d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (stats?.daily && stats?.top_domains) {
    topDomains = (stats.top_domains as { hostname: string; requests: number }[])
      .slice(0, 5)
      .map((d) => [d.hostname, d.requests]);
    dailyTraffic = (stats.daily as { date: string; bytes: number }[]).map((d) => [dayLabel(d.date), d.bytes]);
  } else {
    const domainsMap = new Map<string, number>();
    for (const r of usage) {
      domainsMap.set(r.hostname, (domainsMap.get(r.hostname) || 0) + r.requests);
    }
    topDomains = Array.from(domainsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const dailyMap = new Map<string, number>();
    for (const r of usage) {
      const day = dayLabel(r.date);
      dailyMap.set(day, (dailyMap.get(day) || 0) + (r.bytesSent + r.bytesReceived));
    }
    dailyTraffic = Array.from(dailyMap.entries()).reverse();
  }

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
    { label: 'Sticky Standard (host:port:user-session-id:pass, 4 champs)', value: '{host}:{port}:{username}-session-{session}:{password}' },
    { label: 'Sticky @ (user-session-session:pass@host:port)', value: '{username}-session-{session}:{password}@{host}:{port}' },
    { label: 'Sticky HTTP URI', value: 'http://{username}-session-{session}:{password}@{host}:{port}', overrideProto: true },
    { label: 'Sticky SOCKS5 URI', value: 'socks5://{username}-session-{session}:{password}@{host}:{port}', overrideProto: true },
    { label: 'Session statique (host:port:user:pass, sans champ extra)', value: 'static' },
    { label: 'Host:Port seulement', value: '{host}:{port}' },
  ];

  const generate = async () => {
    setGenerating(true);
    try {
      if (format === 'static') {
        // Identifiants temporaires dédiés : chaque ligne est déjà un simple
        // host:port:user:pass épinglé sur son propre upstream côté moteur —
        // pas de template à appliquer.
        const { data } = await api.get(`/me/proxies/${proxy.id}/static-session?count=${count}`);
        const lines = data.proxies as string[];
        const withProto = protocol !== 'none'
          ? lines.map((line) => {
              const [host, port, username, password] = line.split(':');
              return `${protocol}${username}:${password}@${host}:${port}`;
            })
          : lines;
        setProxies(withProto);
        return;
      }
      const isSticky = format.includes('{session}') || format.includes('session');
      const fetchCount = isSticky ? count : 1;
      const { data } = await api.get(`/me/proxies/${proxy.id}/sticky-list?count=${fetchCount}`);
      const rawLines = data.proxies as string[];
      const formatted = rawLines.map((line) => {
        // Format brut API (depuis v2.4.5) : host:port:user-session-XXXX:pass
        // (4 champs, compatible avec tout logiciel qui n'accepte pas le
        // format à 5 champs host:port:user:session:pass).
        const parts = line.split(':');
        if (parts.length < 4) return line;
        const [host, port, userWithSession, password] = parts;
        const sessionMarker = '-session-';
        const sessionIdx = userWithSession.indexOf(sessionMarker);
        const username = sessionIdx !== -1 ? userWithSession.slice(0, sessionIdx) : userWithSession;
        const session = sessionIdx !== -1 ? userWithSession.slice(sessionIdx + sessionMarker.length) : '';

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
              {format.includes('{session}') || format.includes('session') || format === 'custom' || format === 'static' ? (
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
