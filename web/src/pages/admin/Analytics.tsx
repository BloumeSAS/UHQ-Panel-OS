import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Globe2, Server, Gauge, Trophy, BarChart3 } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
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

  const h = history.data ?? [];
  const last = h[h.length - 1];
  const healthRate = pool.data?.total_proxies ? Math.round((pool.data.working_proxies / pool.data.total_proxies) * 1000) / 10 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Analytics Pool & Proxies
          </h1>
          <p className="text-muted-foreground mt-1">Vue complète de la santé et de la performance du pool.</p>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Server} label="Total pool" value={pool.data?.total_proxies ?? '—'} />
        <Stat icon={Activity} label="Fonctionnels" value={pool.data?.working_proxies ?? '—'} sub={`${healthRate}%`} good />
        <Stat icon={Gauge} label="Morts / bannis" value={pool.data?.dead_proxies ?? '—'} bad={!!pool.data?.dead_proxies} />
        <Stat icon={Globe2} label="Pays couverts" value={Object.keys(countries.data ?? {}).length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Évolution du pool ({RANGES.find((r) => r.hours === hours)?.label})</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart data={h} />
          {last && (
            <p className="text-xs text-muted-foreground mt-2">
              Dernier snapshot : {new Date(last.createdAt).toLocaleString()} — {last.working}/{last.total} fonctionnels ({last.healthPct?.toFixed?.(1)}%)
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Répartition par pays</CardTitle></CardHeader>
          <CardContent>
            <DistList data={Object.entries(countries.data ?? {}).slice(0, 12)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Répartition par provider</CardTitle></CardHeader>
          <CardContent>
            <DistList data={Object.entries(pool.data?.by_provider ?? {})} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Répartition par protocole</CardTitle></CardHeader>
          <CardContent>
            <DistList data={Object.entries(pool.data?.by_protocol ?? {})} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Distribution de latence</CardTitle></CardHeader>
          <CardContent>
            <LatencyBars data={latency.data ?? []} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Top proxies (7 derniers jours)
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <TopProxiesTable rows={reports.data?.pool?.top_proxies ?? []} />
        </CardContent>
      </Card>

      <AddonPageBar />
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

function TrendChart({ data }: { data: any[] }) {
  if (!data.length) return <p className="text-sm text-muted-foreground text-center py-10">Pas encore de données historiques.</p>;
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
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" /> Fonctionnels</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-muted-foreground" /> Total pool</span>
        <span className="ml-auto">{new Date(data[0].createdAt).toLocaleString()} → {new Date(data[data.length - 1].createdAt).toLocaleString()}</span>
      </div>
    </div>
  );
}

function TopProxiesTable({ rows }: { rows: any[] }) {
  const t = useT();
  if (!rows.length) return <p className="text-sm text-muted-foreground text-center py-6">—</p>;
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50">
        <tr>
          <th className="px-3 py-2 text-left font-medium">Proxy</th>
          <th className="px-3 py-2 text-left font-medium">Pays</th>
          <th className="px-3 py-2 text-left font-medium">Provider</th>
          <th className="px-3 py-2 text-right font-medium">Latence</th>
          <th className="px-3 py-2 text-right font-medium">Taux succès</th>
          <th className="px-3 py-2 text-right font-medium">Statut</th>
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
                {p.is_working ? 'actif' : 'hors ligne'}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
