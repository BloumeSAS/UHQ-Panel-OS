import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Database, Users, TrendingUp, Globe2, Boxes, ArrowUp, ArrowDown, FileDown } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle, Button, Table, THead, TBody, TR, TH, TD, Badge } from '@/components/ui';

type Period = 'day' | 'week' | 'month' | 'year' | 'all';

interface ReportData {
  period: string;
  traffic: {
    total_gb: number;
    total_requests: number;
    top_domains: Array<{ hostname: string; requests: number }>;
    daily: Array<{ date: string; gb: number; requests: number }>;
    previous_total_gb: number | null;
    previous_total_requests: number | null;
  };
  users: {
    panel_total: number;
    panel_active: number;
    proxy_accounts: Array<{
      id: string;
      name: string;
      username: string;
      used_gb: number;
      total_requests: number;
      limit_gb: number;
      is_blocked: boolean;
    }>;
  };
  pool: {
    total: number;
    working: number;
    banned: number;
    health_rate: number;
    top_proxies: Array<{
      proxy: string;
      protocol: string;
      country: string | null;
      provider: string | null;
      success: number;
      failure: number;
      latency_ms: number | null;
      is_working: boolean;
      success_rate: number | null;
    }>;
    by_provider: Record<string, { total: number; working: number }>;
  };
  scraper: {
    sources_total: number;
    sources_enabled: number;
    sources: Array<{ id: string; name: string; url: string; enabled: boolean; protocol: string }>;
  };
}

const PERIODS: { key: Period; labelKey: string }[] = [
  { key: 'day', labelKey: 'reports.periodDay' },
  { key: 'week', labelKey: 'reports.periodWeek' },
  { key: 'month', labelKey: 'reports.periodMonth' },
  { key: 'year', labelKey: 'reports.periodYear' },
  { key: 'all', labelKey: 'reports.periodAll' },
];

export default function Reports() {
  const t = useT();
  const [period, setPeriod] = useState<Period>('week');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['reports', period],
    queryFn: async () => (await api.get(`/monitoring/reports?period=${period}`)).data as ReportData,
    refetchInterval: 60_000,
  });

  // Toujours sur 1 an, indépendant du filtre période, pour la heatmap calendrier.
  const { data: yearData } = useQuery({
    queryKey: ['reports', 'year-heatmap'],
    queryFn: async () => (await api.get('/monitoring/reports?period=year')).data as ReportData,
    staleTime: 5 * 60_000,
  });

  const exportJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `uhq-report-${period}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const exportPdf = () => window.print();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('reports.title')}</h1>
        <div className="flex gap-2 flex-wrap">
          {PERIODS.map((p) => (
            <Button
              key={p.key}
              variant={period === p.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod(p.key)}
            >
              {t(p.labelKey)}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={exportJson} disabled={!data}>
            {t('common.download')} JSON
          </Button>
          <Button variant="outline" size="sm" onClick={exportPdf} disabled={!data} className="print:hidden">
            <FileDown className="h-3.5 w-3.5 mr-1.5" /> Exporter en PDF
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground">{t('app.loading')}</p>}

      {data && (
        <>
          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={TrendingUp}
              label={t('reports.totalGb')}
              value={`${data.traffic.total_gb} Go`}
              delta={pctDelta(data.traffic.total_gb, data.traffic.previous_total_gb)}
            />
            <StatCard
              icon={Activity}
              label={t('reports.totalRequests')}
              value={data.traffic.total_requests.toLocaleString()}
              delta={pctDelta(data.traffic.total_requests, data.traffic.previous_total_requests)}
            />
            <StatCard icon={Users} label={t('reports.panelUsers')} value={`${data.users.panel_active} / ${data.users.panel_total}`} />
            <StatCard
              icon={Boxes}
              label={t('reports.poolHealth')}
              value={`${data.pool.working} / ${data.pool.total}`}
              sub={`${data.pool.health_rate}%`}
            />
          </div>

          {/* Heatmap calendrier (activité quotidienne, 1 an) */}
          {yearData && yearData.traffic.daily.length > 0 && (
            <Card className="print:hidden">
              <CardHeader><CardTitle>Activité quotidienne (12 derniers mois)</CardTitle></CardHeader>
              <CardContent>
                <CalendarHeatmap data={yearData.traffic.daily} />
              </CardContent>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Top domaines */}
            <Card>
              <CardHeader><CardTitle>{t('reports.topDomains')}</CardTitle></CardHeader>
              <CardContent>
                {data.traffic.top_domains.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('reports.noData')}</p>
                ) : (
                  <BarList items={data.traffic.top_domains.map((d) => ({ label: d.hostname, value: d.requests }))} />
                )}
              </CardContent>
            </Card>

            {/* Trafic quotidien */}
            <Card>
              <CardHeader><CardTitle>{t('reports.dailyTraffic')}</CardTitle></CardHeader>
              <CardContent>
                {data.traffic.daily.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('reports.noData')}</p>
                ) : (
                  <BarList items={data.traffic.daily.map((d) => ({ label: d.date, value: d.gb }))} />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Comptes proxy */}
          <Card>
            <CardHeader><CardTitle>{t('reports.proxyAccounts')}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>{t('sub.label')}</TH>
                    <TH>{t('sub.username')}</TH>
                    <TH>{t('sub.trafficUsed')}</TH>
                    <TH>{t('reports.requests')}</TH>
                    <TH>{t('reports.limit')}</TH>
                    <TH>{t('reports.status')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.users.proxy_accounts.map((u) => (
                    <TR key={u.id}>
                      <TD className="font-medium">{u.name}</TD>
                      <TD className="font-mono text-xs">{u.username}</TD>
                      <TD>{u.used_gb.toFixed(3)} Go</TD>
                      <TD>{u.total_requests.toLocaleString()}</TD>
                      <TD>{u.limit_gb > 0 ? `${u.limit_gb.toFixed(1)} Go` : '∞'}</TD>
                      <TD>
                        {u.is_blocked ? (
                          <Badge variant="destructive">{t('sub.blocked')}</Badge>
                        ) : (
                          <Badge variant="secondary">{t('users.active')}</Badge>
                        )}
                      </TD>
                    </TR>
                  ))}
                  {data.users.proxy_accounts.length === 0 && (
                    <TR>
                      <TD colSpan={6} className="py-6 text-center text-muted-foreground">
                        {t('reports.noData')}
                      </TD>
                    </TR>
                  )}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Par provider */}
            <Card>
              <CardHeader><CardTitle>{t('reports.byProvider')}</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(data.pool.by_provider)
                    .sort(([, a], [, b]) => b.total - a.total)
                    .map(([provider, stats]) => (
                      <div key={provider} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{provider}</span>
                          <span className="text-muted-foreground">
                            {stats.working}/{stats.total} ({stats.total > 0 ? Math.round(stats.working / stats.total * 100) : 0}%)
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted">
                          <div
                            className="h-1.5 rounded-full bg-primary"
                            style={{ width: `${stats.total > 0 ? (stats.working / stats.total) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            {/* Sources scraper */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {t('reports.scraperSources')}{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({data.scraper.sources_enabled}/{data.scraper.sources_total} {t('reports.active')})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.scraper.sources.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-sm">
                      <span className="font-medium">{s.name}</span>
                      <div className="flex gap-2 items-center">
                        <span className="text-muted-foreground text-xs">{s.protocol}</span>
                        <Badge variant={s.enabled ? 'secondary' : 'outline'}>
                          {s.enabled ? t('reports.enabled') : t('reports.disabled')}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {data.scraper.sources.length === 0 && (
                    <p className="text-sm text-muted-foreground">{t('reports.noData')}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top proxies */}
          <Card>
            <CardHeader><CardTitle>{t('reports.topProxies')}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Proxy</TH>
                    <TH>{t('scraper.protocol')}</TH>
                    <TH>{t('reports.country')}</TH>
                    <TH>{t('reports.provider')}</TH>
                    <TH>{t('reports.successRate')}</TH>
                    <TH>{t('reports.latency')}</TH>
                    <TH>{t('reports.status')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.pool.top_proxies.map((p) => (
                    <TR key={p.proxy}>
                      <TD className="font-mono text-xs">{p.proxy}</TD>
                      <TD>{p.protocol}</TD>
                      <TD>{p.country || '—'}</TD>
                      <TD>{p.provider || '—'}</TD>
                      <TD>
                        {p.success_rate != null ? (
                          <span className={p.success_rate >= 70 ? 'text-green-500' : p.success_rate >= 40 ? 'text-yellow-500' : 'text-destructive'}>
                            {p.success_rate}%
                          </span>
                        ) : '—'}
                      </TD>
                      <TD>{p.latency_ms != null ? `${p.latency_ms} ms` : '—'}</TD>
                      <TD>
                        <Badge variant={p.is_working ? 'secondary' : 'outline'}>
                          {p.is_working ? 'OK' : 'KO'}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                  {data.pool.top_proxies.length === 0 && (
                    <TR>
                      <TD colSpan={7} className="py-6 text-center text-muted-foreground">
                        {t('reports.noData')}
                      </TD>
                    </TR>
                  )}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/** % de variation vs période précédente de même durée. null si non comparable. */
function pctDelta(current: number, previous: number | null): number | null {
  if (previous == null) return null;
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function StatCard({ icon: Icon, label, value, sub, delta }: { icon: React.ElementType; label: string; value: any; sub?: string; delta?: number | null }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="rounded-lg bg-primary/10 p-3 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <div className="text-2xl font-bold">
              {value} {sub && <span className="text-sm font-normal text-muted-foreground">{sub}</span>}
            </div>
            {delta != null && (
              <span className={`flex items-center text-xs font-medium ${delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                {delta >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {Math.abs(delta)}%
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{label} {delta != null && <span className="opacity-70">vs période précédente</span>}</div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Heatmap calendrier façon GitHub — intensité = trafic (Go) par jour. */
function CalendarHeatmap({ data }: { data: Array<{ date: string; gb: number; requests: number }> }) {
  const byDate = new Map(data.map((d) => [d.date, d]));
  const max = Math.max(...data.map((d) => d.gb), 0.001);

  const today = new Date();
  const days: string[] = [];
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  // Aligner sur des colonnes de 7 jours (lundi -> dimanche), semaines en colonnes.
  const firstDow = (new Date(days[0]).getDay() + 6) % 7; // 0 = lundi
  const padded = Array(firstDow).fill(null).concat(days);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));

  const colorFor = (gb: number) => {
    const ratio = gb / max;
    if (gb <= 0) return 'bg-muted';
    if (ratio < 0.25) return 'bg-primary/25';
    if (ratio < 0.5) return 'bg-primary/50';
    if (ratio < 0.75) return 'bg-primary/75';
    return 'bg-primary';
  };

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1 w-max">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((date, di) => {
              if (!date) return <div key={di} className="h-3 w-3" />;
              const d = byDate.get(date);
              return (
                <div
                  key={date}
                  title={`${date} — ${d ? `${d.gb.toFixed(3)} Go, ${d.requests} req.` : 'aucune donnée'}`}
                  className={`h-3 w-3 rounded-sm ${colorFor(d?.gb ?? 0)}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground">
        <span>Moins</span>
        <div className="h-3 w-3 rounded-sm bg-muted" />
        <div className="h-3 w-3 rounded-sm bg-primary/25" />
        <div className="h-3 w-3 rounded-sm bg-primary/50" />
        <div className="h-3 w-3 rounded-sm bg-primary/75" />
        <div className="h-3 w-3 rounded-sm bg-primary" />
        <span>Plus</span>
      </div>
    </div>
  );
}

function BarList({ items }: { items: Array<{ label: string; value: number }> }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="truncate font-medium">{item.label}</span>
            <span className="text-muted-foreground ml-2">{typeof item.value === 'number' && item.value < 1 ? item.value.toFixed(4) : item.value}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
