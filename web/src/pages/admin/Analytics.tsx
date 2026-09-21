import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, Globe2, Server, Gauge, Trophy, BarChart3, Zap, Users, Cpu, MemoryStick,
  Database, ArrowUp, ArrowDown, Clock, Flame,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { formatBytes } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { cn } from '@/lib/utils';
import { AddonPageBar } from '@/components/AddonPageBar';

const RANGES = [
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7j', hours: 168 },
];

export default function Analytics() {
  const t = useT();
  const [hours, setHours] = useState(24);

  const history = useQuery({
    queryKey: ['analytics', 'history', hours],
    queryFn: async () => (await api.get(`/monitoring/pool-health-history?hours=${hours}`)).data.data as any[],
    refetchInterval: 60000,
  });
  // Volume de trafic par intervalle de 15 min (deltas déjà calculés côté serveur) — même plage que le graphique de santé du pool.
  const trafficHistory = useQuery({
    queryKey: ['analytics', 'traffic-history', hours],
    queryFn: async () => (await api.get(`/monitoring/traffic-history?hours=${hours}`)).data.data as { createdAt: string; bytesSent: number; bytesReceived: number; requests: number }[],
    refetchInterval: 60000,
  });
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
        <CardHeader>
          <CardTitle>{t('analytics.trafficVolume')} ({RANGES.find((r) => r.hours === hours)?.label})</CardTitle>
        </CardHeader>
        <CardContent>
          <TrafficChart data={trafficHistory.data ?? []} t={t} />
        </CardContent>
      </Card>

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
              {t('analytics.topDomainsToday')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TopDomainsList data={live.data?.today_summary?.top_domains ?? []} />
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

      <AddonPageBar />
    </div>
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
              {a.totalGb ? `${a.usedGb?.toFixed?.(1) ?? 0}/${a.totalGb} Go` : '∞'}
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
