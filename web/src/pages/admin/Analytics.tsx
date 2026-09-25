import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, Globe2, Server, Gauge, Trophy, BarChart3, Zap, Users, Cpu, MemoryStick,
  Database, ArrowUp, ArrowDown, Clock, Flame, TrendingUp, TrendingDown, Minus,
  Search, X, ImageDown, FileDown, Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { formatBytes } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import { AddonPageBar } from '@/components/AddonPageBar';
import { toast } from '@/lib/toast';

const RANGES = [
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7j', hours: 168 },
];

/**
 * Étant donné une série (comptes/dates), déjà fetchée sur 2x la plage
 * demandée, coupe en deux moitiés égales : "current" est ce qui doit
 * s'afficher dans le graphique, "previous" sert uniquement au calcul de
 * variation ("+12% vs période précédente"). Pas d'appel serveur supplémentaire.
 */
function splitForComparison<T>(rows: T[]): { current: T[]; previous: T[] } {
  const mid = Math.floor(rows.length / 2);
  return { previous: rows.slice(0, mid), current: rows.slice(mid) };
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? null : 0;
  return ((current - previous) / previous) * 100;
}

export default function Analytics() {
  const t = useT();
  const [hours, setHours] = useState(24);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<'png' | 'pdf' | null>(null);

  // ── Filtre par sous-utilisateur ──────────────────────────────────────
  const [subuserQuery, setSubuserQuery] = useState('');
  const [subuserOpen, setSubuserOpen] = useState(false);
  const [selectedSubuser, setSelectedSubuser] = useState<{ id: string; username: string; label: string } | null>(null);
  const subusersList = useQuery({
    queryKey: ['analytics', 'subusers-list'],
    queryFn: async () => (await api.get('/subusers')).data.data as { id: string; username: string; label: string }[],
    enabled: subuserOpen,
    staleTime: 60000,
  });
  const filteredSubusers = (subusersList.data ?? [])
    .filter((u) => {
      if (!subuserQuery) return true;
      const q = subuserQuery.toLowerCase();
      return u.username.toLowerCase().includes(q) || u.label.toLowerCase().includes(q);
    })
    .slice(0, 20);

  // Fetché sur 2x la plage demandée pour la comparaison période/période, sans appel supplémentaire.
  const days = Math.max(1, Math.ceil(hours / 24));

  const history = useQuery({
    queryKey: ['analytics', 'history', hours],
    queryFn: async () => (await api.get(`/monitoring/pool-health-history?hours=${hours}`)).data.data as any[],
    refetchInterval: 60000,
    enabled: !selectedSubuser,
  });
  // Volume de trafic global, par intervalle de 15 min (deltas déjà calculés côté serveur).
  const globalTraffic = useQuery({
    queryKey: ['analytics', 'traffic-history', hours],
    queryFn: async () => (await api.get(`/monitoring/traffic-history?hours=${hours * 2}`)).data.data as { createdAt: string; bytesSent: number; bytesReceived: number; requests: number }[],
    refetchInterval: 60000,
    enabled: !selectedSubuser,
  });
  // Volume de trafic pour LE compte sélectionné, granularité jour (limite du modèle ProxyUsage).
  const subuserTraffic = useQuery({
    queryKey: ['analytics', 'subuser-traffic', selectedSubuser?.id, days],
    queryFn: async () => (await api.get(`/subusers/${selectedSubuser!.id}/traffic-history?days=${days * 2}`)).data.data as { date: string; bytesSent: number; bytesReceived: number; requests: number }[],
    enabled: !!selectedSubuser,
  });
  // Stats totales + top domaines pour CE compte (endpoint déjà utilisé par la vue Stats de Sous-utilisateurs).
  const subuserUsage = useQuery({
    queryKey: ['analytics', 'subuser-usage', selectedSubuser?.id],
    queryFn: async () => (await api.get(`/subusers/${selectedSubuser!.id}/usage?period=week`)).data,
    enabled: !!selectedSubuser,
  });

  const trafficRaw = selectedSubuser
    ? (subuserTraffic.data ?? []).map((d) => ({ createdAt: d.date, bytesSent: d.bytesSent, bytesReceived: d.bytesReceived, requests: d.requests }))
    : (globalTraffic.data ?? []);
  const { current: trafficCurrent, previous: trafficPrevious } = splitForComparison(trafficRaw);
  const trafficComparisonPct = pctChange(
    trafficCurrent.reduce((a, d) => a + d.bytesSent + d.bytesReceived, 0),
    trafficPrevious.reduce((a, d) => a + d.bytesSent + d.bytesReceived, 0),
  );

  const pool = useQuery({
    queryKey: ['analytics', 'pool'],
    queryFn: async () => (await api.get('/monitoring/pool')).data.data,
    refetchInterval: 30000,
  });
  const countries = useQuery({
    queryKey: ['analytics', 'countries'],
    queryFn: async () => (await api.get('/monitoring/countries')).data.data as Record<string, number>,
    refetchInterval: 60000,
  });
  const latency = useQuery({
    queryKey: ['analytics', 'latency'],
    queryFn: async () => (await api.get('/monitoring/latency-distribution')).data.data as { bucket: string; count: number }[],
    refetchInterval: 60000,
  });
  const reports = useQuery({
    queryKey: ['analytics', 'reports'],
    queryFn: async () => (await api.get('/monitoring/reports?period=week')).data,
    refetchInterval: 60000,
  });
  // Snapshot temps réel : threads/sessions actifs, conso du jour, top domaines du jour.
  const live = useQuery({
    queryKey: ['analytics', 'live'],
    queryFn: async () => (await api.get('/monitoring/live')).data,
    refetchInterval: 5000,
  });
  // RAM/CPU process+hôte, latence DB — même source que le dashboard, réutilisée ici en contexte "analytics".
  const sysHealth = useQuery({
    queryKey: ['analytics', 'system-health'],
    queryFn: async () => (await api.get('/monitoring/system-health')).data.data,
    refetchInterval: 15000,
  });
  // Comptes actuellement en train de faire passer du trafic — triés par threads actifs.
  const activeAccounts = useQuery({
    queryKey: ['analytics', 'active-accounts'],
    queryFn: async () => (await api.get('/monitoring/active-accounts')).data.data as any[],
    refetchInterval: 5000,
  });

  const h = history.data ?? [];
  const last = h[h.length - 1];
  const healthRate = pool.data?.total_proxies ? Math.round((pool.data.working_proxies / pool.data.total_proxies) * 1000) / 10 : 0;

  const selectSubuser = (u: { id: string; username: string; label: string }) => {
    setSelectedSubuser(u);
    setSubuserQuery('');
    setSubuserOpen(false);
  };

  const exportDashboard = async (kind: 'png' | 'pdf') => {
    if (!dashboardRef.current) return;
    setExporting(kind);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(dashboardRef.current, {
        backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
        scale: 2,
        useCORS: true,
      });
      const filename = `analytics-${new Date().toISOString().slice(0, 10)}`;
      if (kind === 'png') {
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `${filename}.png`;
        a.click();
      } else {
        const { jsPDF } = await import('jspdf');
        const pageWidth = 210; // A4 portrait, mm
        const imgHeight = (canvas.height * pageWidth) / canvas.width;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pageWidth, Math.max(imgHeight, 297)] });
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, imgHeight);
        pdf.save(`${filename}.pdf`);
      }
    } catch (e) {
      toast.error(t('analytics.exportFailed'));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            {t('analytics.title')}
          </h1>
          <p className="text-muted-foreground mt-1">{t('analytics.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => exportDashboard('png')} disabled={!!exporting}>
            {exporting === 'png' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageDown className="h-4 w-4" />}
            PNG
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportDashboard('pdf')} disabled={!!exporting}>
            {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            PDF
          </Button>
          <div className="flex rounded-md border overflow-hidden">
            {RANGES.map((r) => (
              <button
                key={r.hours}
                onClick={() => setHours(r.hours)}
                className={cn('px-3 py-1.5 text-sm', hours === r.hours ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filtre par sous-utilisateur — scope les cartes de trafic sur un seul compte au lieu de l'agrégat global. */}
      <div className="relative max-w-sm">
        {selectedSubuser ? (
          <div className="flex items-center gap-2 rounded-md border bg-accent/40 px-3 py-2 text-sm">
            <Users className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{selectedSubuser.label}</div>
              <div className="text-xs text-muted-foreground font-mono truncate">{selectedSubuser.username}</div>
            </div>
            <button onClick={() => setSelectedSubuser(null)} className="shrink-0 text-muted-foreground hover:text-foreground" title={t('analytics.clearSubuserFilter')}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={subuserQuery}
              onChange={(e) => setSubuserQuery(e.target.value)}
              onFocus={() => setSubuserOpen(true)}
              onBlur={() => setTimeout(() => setSubuserOpen(false), 150)}
              placeholder={t('analytics.filterBySubuser')}
              className="pl-8"
            />
            {subuserOpen && (
              <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-md border bg-popover shadow-lg">
                {!filteredSubusers.length && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">{t('common.none')}</p>
                )}
                {filteredSubusers.map((u) => (
                  <button
                    key={u.id}
                    onMouseDown={() => selectSubuser(u)}
                    className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="font-medium truncate w-full">{u.label}</span>
                    <span className="text-xs text-muted-foreground font-mono truncate w-full">{u.username}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div ref={dashboardRef} className="space-y-6 bg-background">
      {/* Bandeau temps réel — rafraîchi toutes les 5s, indépendant de la période sélectionnée */}
      <LiveStrip live={live.data} sysHealth={sysHealth.data} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Server} label={t('analytics.totalPool')} value={pool.data?.total_proxies ?? '—'} />
        <Stat icon={Activity} label={t('analytics.working')} value={pool.data?.working_proxies ?? '—'} sub={`${healthRate}%`} good />
        <Stat icon={Gauge} label={t('analytics.deadBanned')} value={pool.data?.dead_proxies ?? '—'} bad={!!pool.data?.dead_proxies} />
        <Stat icon={Globe2} label={t('analytics.countriesCovered')} value={Object.keys(countries.data ?? {}).length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('analytics.poolEvolution')} ({RANGES.find((r) => r.hours === hours)?.label})</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart data={h} t={t} />
          {last && (
            <p className="text-xs text-muted-foreground mt-2">
              {t('analytics.lastSnapshot')} : {new Date(last.createdAt).toLocaleString()} — {last.working}/{last.total} {t('analytics.workingLower')} ({last.healthPct?.toFixed?.(1)}%)
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>
            {t('analytics.trafficVolume')}
            {selectedSubuser ? ` — ${selectedSubuser.label}` : ` (${RANGES.find((r) => r.hours === hours)?.label})`}
          </CardTitle>
          <ComparisonBadge pct={trafficComparisonPct} t={t} />
        </CardHeader>
        <CardContent>
          <TrafficChart data={trafficCurrent} t={t} />
        </CardContent>
      </Card>

      {selectedSubuser && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={Zap} label={t('analytics.activeThreads')} value={subuserUsage.data?.total_stats?.active_threads ?? '—'} sub={subuserUsage.data?.total_stats?.threads_limit ? `/${subuserUsage.data.total_stats.threads_limit}` : undefined} />
          <Stat icon={ArrowUp} label={t('analytics.volumeThisWeek')} value={subuserUsage.data ? formatBytes(subuserUsage.data.total_stats.bytesSent + subuserUsage.data.total_stats.bytesReceived) : '—'} good />
          <Stat icon={ArrowDown} label={t('analytics.requestsThisWeek')} value={subuserUsage.data?.total_stats?.requests?.toLocaleString?.() ?? '—'} />
          <Stat icon={Gauge} label={t('analytics.httpErrors')} value={subuserUsage.data?.total_stats?.errors ?? 0} bad={!!subuserUsage.data?.total_stats?.errors} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t('analytics.byCountry')}</CardTitle></CardHeader>
          <CardContent>
            <DistList data={Object.entries(countries.data ?? {}).slice(0, 12)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('analytics.byProvider')}</CardTitle></CardHeader>
          <CardContent>
            <DistList data={Object.entries(pool.data?.by_provider ?? {})} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('analytics.byProtocol')}</CardTitle></CardHeader>
          <CardContent>
            <DistList data={Object.entries(pool.data?.by_protocol ?? {})} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('analytics.latencyDistribution')}</CardTitle></CardHeader>
          <CardContent>
            <LatencyBars data={latency.data ?? []} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-500" />
              {selectedSubuser ? t('analytics.topDomainsAccount') : t('analytics.topDomainsToday')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TopDomainsList data={selectedSubuser ? (subuserUsage.data?.top_domains ?? []) : (live.data?.today_summary?.top_domains ?? [])} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {t('analytics.activeAccounts')}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <ActiveAccountsTable rows={activeAccounts.data ?? []} t={t} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            {t('analytics.topProxies')}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <TopProxiesTable rows={reports.data?.pool?.top_proxies ?? []} t={t} />
        </CardContent>
      </Card>
      </div>

      <AddonPageBar />
    </div>
  );
}

function ComparisonBadge({ pct, t }: { pct: number | null; t: (k: any) => string }) {
  if (pct === null) return null;
  const rounded = Math.round(pct * 10) / 10;
  const flat = Math.abs(rounded) < 0.5;
  const Icon = flat ? Minus : rounded > 0 ? TrendingUp : TrendingDown;
  const color = flat ? 'text-muted-foreground bg-muted' : rounded > 0 ? 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400' : 'text-destructive bg-destructive/10';
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', color)} title={t('analytics.vsPreviousPeriod')}>
      <Icon className="h-3 w-3" />
      {rounded > 0 ? '+' : ''}{rounded}%
    </span>
  );
}

function LiveStrip({ live, sysHealth }: { live: any; sysHealth: any }) {
  const t = useT();
  const items = [
    { icon: Zap, label: t('analytics.activeThreads'), value: live?.live?.active_threads ?? '—', color: 'text-primary' },
    { icon: Clock, label: t('analytics.activeSessions'), value: live?.live?.active_sessions ?? '—', color: 'text-primary' },
    { icon: ArrowUp, label: t('analytics.todayVolume'), value: live?.today_summary ? formatBytes(live.today_summary.total_gb * 1024 ** 3) : '—', color: 'text-emerald-500' },
    { icon: ArrowDown, label: t('analytics.todayRequests'), value: live?.today_summary?.total_requests?.toLocaleString?.() ?? '—', color: 'text-emerald-500' },
    { icon: Cpu, label: t('analytics.cpuLoad'), value: sysHealth ? `${sysHealth.host.cpuLoadPct}%` : '—', color: sysHealth?.host?.cpuLoadPct > 80 ? 'text-destructive' : 'text-muted-foreground' },
    { icon: MemoryStick, label: t('analytics.ramUsed'), value: sysHealth ? `${sysHealth.process.rssMb} Mo` : '—', color: 'text-muted-foreground' },
    { icon: Database, label: t('analytics.dbLatency'), value: sysHealth?.db?.latencyMs != null ? `${sysHealth.db.latencyMs}ms` : '—', color: sysHealth?.db?.latencyMs > 200 ? 'text-destructive' : 'text-muted-foreground' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-4 lg:grid-cols-7">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2 min-w-0">
          <it.icon className={cn('h-4 w-4 shrink-0', it.color)} />
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{it.value}</div>
            <div className="text-[10px] text-muted-foreground truncate">{it.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, good, bad }: { icon: React.ElementType; label: string; value: any; sub?: string; good?: boolean; bad?: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={cn('rounded-lg p-3', bad ? 'bg-destructive/10 text-destructive' : good ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-primary/10 text-primary')}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-bold">
            {value} {sub && <span className="text-sm font-normal text-muted-foreground">{sub}</span>}
          </div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function DistList({ data }: { data: [string, any][] }) {
  if (!data.length) return <p className="text-sm text-muted-foreground">—</p>;
  const max = Math.max(...data.map(([, v]) => Number(v) || 0), 1);
  return (
    <div className="space-y-2">
      {data.map(([k, v]) => (
        <div key={k} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="truncate font-medium">{k}</span>
            <span className="text-muted-foreground">{v as any}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${(Number(v) / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TopDomainsList({ data }: { data: { hostname: string; requests: number }[] }) {
  const t = useT();
  if (!data.length) return <p className="text-sm text-muted-foreground text-center py-6">{t('analytics.noDataYet')}</p>;
  const max = Math.max(...data.map((d) => d.requests), 1);
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.hostname} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="truncate font-mono text-xs">{d.hostname}</span>
            <span className="text-muted-foreground shrink-0 ml-2">{d.requests.toLocaleString()} req</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-orange-500 transition-all" style={{ width: `${(d.requests / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ActiveAccountsTable({ rows, t }: { rows: any[]; t: (k: any) => string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground text-center py-6">{t('analytics.noActiveAccounts')}</p>;
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50">
        <tr>
          <th className="px-3 py-2 text-left font-medium">{t('sub.label')}</th>
          <th className="px-3 py-2 text-right font-medium">{t('analytics.threads')}</th>
          <th className="px-3 py-2 text-right font-medium">↑</th>
          <th className="px-3 py-2 text-right font-medium">↓</th>
          <th className="px-3 py-2 text-right font-medium">{t('sub.trafficLimit')}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.slice(0, 12).map((a: any) => (
          <tr key={a.username} className="hover:bg-muted/30 transition-colors">
            <td className="px-3 py-2">
              <div className="font-medium truncate max-w-[140px]">{a.label}</div>
              <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[140px]">{a.username}</div>
            </td>
            <td className="px-3 py-2 text-right">
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                {a.threads}{a.threadsLimit ? `/${a.threadsLimit}` : ''}
              </span>
            </td>
            <td className="px-3 py-2 text-right font-mono text-xs text-emerald-600 dark:text-emerald-400">{formatBytes(a.sentBps)}/s</td>
            <td className="px-3 py-2 text-right font-mono text-xs text-blue-600 dark:text-blue-400">{formatBytes(a.receivedBps)}/s</td>
            <td className="px-3 py-2 text-right text-xs text-muted-foreground">
              {a.totalGb ? `${a.usedGb?.toFixed?.(2) ?? 0}/${Number(a.totalGb).toFixed(2)} Go` : '∞'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LatencyBars({ data }: { data: { bucket: string; count: number }[] }) {
  if (!data.length) return <p className="text-sm text-muted-foreground text-center py-6">—</p>;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end justify-between gap-2 h-32 pt-4 px-1 border-b">
      {data.map((d) => (
        <div key={d.bucket} className="flex-1 flex flex-col items-center group relative min-w-0">
          <div className="absolute bottom-full mb-1 hidden group-hover:block bg-popover border text-popover-foreground text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap shadow-md z-10">
            {d.count} proxies
          </div>
          <div
            className="w-full bg-primary rounded-t transition-all hover:bg-primary/80"
            style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}
          />
          <span className="text-[9px] text-muted-foreground mt-1 truncate w-full text-center">{d.bucket}</span>
        </div>
      ))}
    </div>
  );
}

function TrafficChart({ data, t }: { data: { createdAt: string; bytesSent: number; bytesReceived: number; requests: number }[]; t: (k: any) => string }) {
  if (!data.length) return <p className="text-sm text-muted-foreground text-center py-10">{t('analytics.noHistoryYet')}</p>;
  const height = 160;
  const width = 100;
  const maxVal = Math.max(...data.map((d) => Math.max(d.bytesSent, d.bytesReceived)), 1);

  const pathFor = (key: 'bytesSent' | 'bytesReceived') =>
    data.map((d, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * width;
      const y = height - (d[key] / maxVal) * height;
      return `${x},${y}`;
    }).join(' ');

  const totalSent = data.reduce((a, d) => a + d.bytesSent, 0);
  const totalReceived = data.reduce((a, d) => a + d.bytesReceived, 0);
  const totalRequests = data.reduce((a, d) => a + d.requests, 0);

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40 overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="receivedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${height} ${pathFor('bytesReceived')} ${width},${height}`} fill="url(#receivedGrad)" />
        <polyline points={pathFor('bytesReceived')} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        <polygon points={`0,${height} ${pathFor('bytesSent')} ${width},${height}`} fill="url(#sentGrad)" />
        <polyline points={pathFor('bytesSent')} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#10b981' }} /> {t('analytics.sent')} ({formatBytes(totalSent)})</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" /> {t('analytics.received')} ({formatBytes(totalReceived)})</span>
        <span>{totalRequests.toLocaleString()} {t('analytics.requests')}</span>
        <span className="ml-auto">{new Date(data[0].createdAt).toLocaleString()} → {new Date(data[data.length - 1].createdAt).toLocaleString()}</span>
      </div>
    </div>
  );
}

function TrendChart({ data, t }: { data: any[]; t: (k: any) => string }) {
  if (!data.length) return <p className="text-sm text-muted-foreground text-center py-10">{t('analytics.noHistoryYet')}</p>;
  const height = 160;
  const width = 100;
  const maxTotal = Math.max(...data.map((d) => d.total), 1);

  const pathFor = (key: 'working' | 'total') =>
    data.map((d, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * width;
      const y = height - (d[key] / maxTotal) * height;
      return `${x},${y}`;
    }).join(' ');

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40 overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.15" />
            <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="workingGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${height} ${pathFor('total')} ${width},${height}`} fill="url(#totalGrad)" />
        <polyline points={pathFor('total')} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1" strokeDasharray="2,2" />
        <polygon points={`0,${height} ${pathFor('working')} ${width},${height}`} fill="url(#workingGrad)" />
        <polyline points={pathFor('working')} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" /> {t('analytics.workingLower')}</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-muted-foreground" /> {t('analytics.totalPoolLower')}</span>
        <span className="ml-auto">{new Date(data[0].createdAt).toLocaleString()} → {new Date(data[data.length - 1].createdAt).toLocaleString()}</span>
      </div>
    </div>
  );
}

function TopProxiesTable({ rows, t }: { rows: any[]; t: (k: any) => string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground text-center py-6">—</p>;
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50">
        <tr>
          <th className="px-3 py-2 text-left font-medium">{t('analytics.proxy')}</th>
          <th className="px-3 py-2 text-left font-medium">{t('sub.country')}</th>
          <th className="px-3 py-2 text-left font-medium">{t('reports.provider')}</th>
          <th className="px-3 py-2 text-right font-medium">{t('analytics.latency')}</th>
          <th className="px-3 py-2 text-right font-medium">{t('analytics.successRate')}</th>
          <th className="px-3 py-2 text-right font-medium">{t('sub.blocked')}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.slice(0, 15).map((p: any, i: number) => (
          <tr key={i} className="hover:bg-muted/30 transition-colors">
            <td className="px-3 py-2 font-mono text-xs">{p.proxy}</td>
            <td className="px-3 py-2">{p.country || '—'}</td>
            <td className="px-3 py-2 text-muted-foreground">{p.provider || '—'}</td>
            <td className="px-3 py-2 text-right font-mono text-xs">{p.latency_ms != null ? `${p.latency_ms}ms` : '—'}</td>
            <td className="px-3 py-2 text-right">{p.success_rate != null ? `${p.success_rate}%` : '—'}</td>
            <td className="px-3 py-2 text-right">
              <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', p.is_working ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-destructive/10 text-destructive')}>
                {p.is_working ? t('analytics.statusActive') : t('analytics.statusOffline')}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
