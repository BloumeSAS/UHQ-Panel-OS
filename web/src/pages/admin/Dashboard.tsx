import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Boxes, Globe2, Network, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { AddonPageBar } from '@/components/AddonPageBar';

export default function Dashboard() {
  const t = useT();
  const [wsData, setWsData] = useState<any>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: any = null;

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host;
      const token = localStorage.getItem('uhq_token') || '';
      const wsUrl = `${protocol}//${host}/api/panel/ws?token=${token}`;

      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.event === 'stats') {
            setWsData(payload.data);
          }
        } catch (err) {
          console.error('WS parse error:', err);
        }
      };

      ws.onclose = () => {
        timer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    connect();

    return () => {
      if (ws) ws.close();
      if (timer) clearTimeout(timer);
    };
  }, []);

  const live = useQuery({
    queryKey: ['monitoring', 'live'],
    queryFn: async () => (await api.get('/monitoring/live')).data,
    refetchInterval: 5000,
  });
  const pool = useQuery({
    queryKey: ['monitoring', 'pool'],
    queryFn: async () => (await api.get('/monitoring/pool')).data,
    refetchInterval: 30000,
  });
  const countries = useQuery({
    queryKey: ['monitoring', 'countries'],
    queryFn: async () => (await api.get('/monitoring/countries')).data,
    refetchInterval: 60000,
  });
  const healthHistory = useQuery({
    queryKey: ['pool-health-history'],
    queryFn: async () => (await api.get('/monitoring/pool-health-history?hours=6')).data,
    refetchInterval: 60000,
  });

  const l = wsData
    ? {
        active_threads: wsData.activeThreads,
        active_sessions: wsData.activeSessions,
        pool: {
          working: wsData.poolWorking,
          total: wsData.poolTotal,
        },
      }
    : live.data?.live;

  const today = live.data?.today_summary;
  const history: any[] = healthHistory.data?.data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('nav.dashboard')}</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Activity} label={t('dash.activeThreads')} value={l?.active_threads ?? '—'} />
        <Stat icon={Network} label={t('dash.activeSessions')} value={l?.active_sessions ?? '—'} />
        <Stat icon={Boxes} label={t('dash.poolWorking')} value={l?.pool?.working ?? '—'} sub={`/ ${l?.pool?.total ?? '—'}`} />
        <Stat icon={Globe2} label={t('dash.todayGb')} value={typeof today?.total_gb === 'number' ? today.total_gb.toFixed(3) : '—'} />
      </div>

      {/* Pool Health History Chart */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {t('dash.poolHealthHistory')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MiniChart data={history} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t('dash.topDomains')}</CardTitle></CardHeader>
          <CardContent>
            <DistList data={(today?.top_domains ?? []).map((d: any) => [d.hostname, d.requests])} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('dash.byProvider')}</CardTitle></CardHeader>
          <CardContent>
            <DistList data={Object.entries(pool.data?.data?.by_provider ?? {})} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('dash.byProtocol')}</CardTitle></CardHeader>
          <CardContent>
            <DistList data={Object.entries(pool.data?.data?.by_protocol ?? {})} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('dash.byCountry')}</CardTitle></CardHeader>
          <CardContent>
            <DistList data={Object.entries(countries.data?.data ?? {}).slice(0, 12)} />
          </CardContent>
        </Card>
      </div>

      <AddonPageBar />
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: any; sub?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="rounded-lg bg-primary/10 p-3 text-primary">
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
            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(Number(v) / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniChart({ data }: { data: any[] }) {
  const max = Math.max(...data.map((d) => d.healthPct), 1);
  const height = 80;
  const width = 100;
  const pts = data.map((d, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * width;
    const y = height - (d.healthPct / 100) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 100 ${height}`} className="w-full h-20 overflow-visible">
        <defs>
          <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Fill area */}
        <polygon
          points={`0,${height} ${pts} 100,${height}`}
          fill="url(#healthGrad)"
        />
        {/* Line */}
        <polyline
          points={pts}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{data[0] ? new Date(data[0].createdAt).toLocaleTimeString() : '—'}</span>
        <span className="font-medium text-foreground">
          {data[data.length - 1]?.healthPct?.toFixed(1) ?? '—'}% {/* latest */}
        </span>
        <span>{data[data.length - 1] ? new Date(data[data.length - 1].createdAt).toLocaleTimeString() : '—'}</span>
      </div>
    </div>
  );
}
