import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Pause, Trash2, Activity, ShieldCheck, ShieldAlert, Globe } from 'lucide-react';
import { api, apiError, getToken } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Badge, Button, Card, CardContent, Table, TBody, TD, TH, THead, TR } from '@/components/ui';
import { cn } from '@/lib/utils';

interface LogEntry {
  ts: number;
  level: string;
  context?: string;
  message: string;
}

interface CheckerStatus {
  running: boolean;
  total: number;
  processed: number;
  progress: number;
  lastRun: string | null;
  lastRunDurationMs: number;
  lastRunProcessed: number;
  pool: {
    total: number;
    working: number;
    dead: number;
    blacklisted: number;
  };
  countries: {
    country: string;
    count: number;
  }[];
}

const LEVEL_COLOR: Record<string, string> = {
  error: 'text-red-500 font-bold',
  warn: 'text-amber-500',
  log: 'text-zinc-100',
  debug: 'text-zinc-500',
  verbose: 'text-zinc-500',
};

function getFlagEmoji(countryCode: string) {
  if (countryCode === 'Unknown' || countryCode === '—') return '❓';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  try {
    return String.fromCodePoint(...codePoints);
  } catch {
    return countryCode;
  }
}

export default function Checker() {
  const t = useT();
  const qc = useQueryClient();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [autoscroll, setAutoscroll] = useState(true);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Status Query
  const { data: statusRes, refetch } = useQuery({
    queryKey: ['checker-status'],
    queryFn: async () => (await api.get('/checker/status')).data.data as CheckerStatus,
    refetchInterval: (query) => {
      // Poll every 2 seconds if the checker is running, else every 15 seconds
      return query.state.data?.running ? 2000 : 15000;
    },
  });

  const status = statusRes;

  // Run Mutation
  const runMutation = useMutation({
    mutationFn: async () => await api.post('/checker/run'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checker-status'] });
      refetch();
    },
  });

  // Load backlog logs & subscribe to stream
  useEffect(() => {
    let active = true;
    let es: EventSource | null = null;

    const initLogs = async () => {
      try {
        const res = await api.get('/logs?context=CheckerService&limit=150');
        if (active) {
          setLogs(res.data.data);
        }
      } catch (err) {
        console.error('Failed to load initial logs', err);
      }

      if (!active) return;

      // Subscribe to stream
      es = new EventSource(`/api/panel/logs/stream?token=${getToken()}`);
      es.onmessage = (ev) => {
        if (pausedRef.current) return;
        try {
          const entry: LogEntry = JSON.parse(ev.data);
          if (entry.context === 'CheckerService') {
            setLogs((prev) => [...prev.slice(-1000), entry]);
          }
        } catch {
          // ignore ping
        }
      };
    };

    initLogs();

    return () => {
      active = false;
      if (es) es.close();
    };
  }, []);

  // Autoscroll logic
  useEffect(() => {
    if (autoscroll && !paused) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoscroll, paused]);

  const healthRate = status?.pool?.total
    ? Math.round((status.pool.working / status.pool.total) * 1000) / 10
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('checker.title')}</h1>
        </div>
      </div>

      {/* Top Grid: Status & Controls & Last Run */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Status Card */}
        <Card className="relative overflow-hidden border bg-card/60 backdrop-blur-md">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{t('checker.statusTitle')}</p>
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3.5 w-3.5">
                    {status?.running ? (
                      <>
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-sky-500"></span>
                      </>
                    ) : (
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                    )}
                  </span>
                  <span className="text-lg font-bold">
                    {status?.running ? t('checker.running') : t('checker.idle')}
                  </span>
                </div>
              </div>

              <Button
                onClick={() => runMutation.mutate()}
                disabled={status?.running || runMutation.isPending}
                className={cn(
                  "relative overflow-hidden font-semibold transition-all duration-300",
                  status?.running
                    ? "bg-muted text-muted-foreground"
                    : "bg-gradient-to-r from-primary to-violet-600 hover:from-primary/95 hover:to-violet-600/95 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30"
                )}
              >
                <Play className="h-4 w-4 mr-1.5" />
                {t('checker.runNow')}
              </Button>
            </div>

            {status?.running && (
              <div className="mt-6 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-muted-foreground">
                    {t('checker.processed')} : {status.processed} / {status.total}
                  </span>
                  <span className="font-semibold text-primary">{status.progress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-violet-500 transition-all duration-500 ease-out"
                    style={{ width: `${status.progress}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Last Run Info */}
        <Card className="border bg-card/60 backdrop-blur-md">
          <CardContent className="p-6 flex flex-col justify-between h-full">
            <p className="text-sm font-medium text-muted-foreground">{t('checker.lastRun')}</p>
            <div className="grid grid-cols-3 gap-4 mt-2">
              <div>
                <p className="text-2xl font-bold font-mono">
                  {status?.lastRun ? new Date(status.lastRun).toLocaleTimeString() : '—'}
                </p>
                <p className="text-xs text-muted-foreground">{t('checker.time')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold font-mono">
                  {status?.lastRunDurationMs ? `${(status.lastRunDurationMs / 1000).toFixed(1)}s` : '—'}
                </p>
                <p className="text-xs text-muted-foreground">{t('checker.lastRunDuration')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold font-mono">
                  {status?.lastRunProcessed ?? '—'}
                </p>
                <p className="text-xs text-muted-foreground">{t('checker.processedCount')}</p>
              </div>
            </div>
            {status?.lastRun && (
              <p className="text-[11px] text-muted-foreground mt-4 italic">
                Date : {new Date(status.lastRun).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4 Cards Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{t('checker.totalProxies')}</p>
              <p className="text-2xl font-bold font-mono">{status?.pool?.total ?? 0}</p>
            </div>
            <Activity className="h-8 w-8 text-primary/30" />
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{t('checker.working')}</p>
              <p className="text-2xl font-bold font-mono text-emerald-500">{status?.pool?.working ?? 0}</p>
            </div>
            <ShieldCheck className="h-8 w-8 text-emerald-500/30" />
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-rose-500">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{t('checker.dead')}</p>
              <p className="text-2xl font-bold font-mono text-rose-500">{status?.pool?.dead ?? 0}</p>
            </div>
            <ShieldAlert className="h-8 w-8 text-rose-500/30" />
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{t('checker.globalHealth')}</p>
              <p className="text-2xl font-bold font-mono text-amber-500">{healthRate}%</p>
            </div>
            <div className="text-sm font-semibold text-amber-500/30 font-mono">RATE</div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Grid: Countries & Logs */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Countries Column */}
        <Card className="lg:col-span-1 border bg-card/60 backdrop-blur-md">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">{t('checker.stats')}</h2>
            </div>
            <div className="max-h-[350px] overflow-y-auto pr-1">
              <Table>
                <THead>
                  <TR>
                    <TH className="py-2 text-xs font-semibold">{t('checker.country')}</TH>
                    <TH className="py-2 text-xs font-semibold text-right">{t('checker.proxies')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {status?.countries?.sort((a, b) => b.count - a.count).map((c, i) => (
                    <TR key={i} className="hover:bg-muted/30">
                      <TD className="py-1.5 flex items-center gap-2 font-medium text-xs">
                        <span className="text-base leading-none">{getFlagEmoji(c.country)}</span>
                        <span>{c.country}</span>
                      </TD>
                      <TD className="py-1.5 text-right font-mono text-xs">{c.count}</TD>
                    </TR>
                  ))}
                  {!status?.countries?.length && (
                    <TR>
                      <TD colSpan={2} className="py-8 text-center text-xs text-muted-foreground">
                        {t('common.none')}
                      </TD>
                    </TR>
                  )}
                </TBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Logs Column (Spans 2 columns) */}
        <Card className="lg:col-span-2 border bg-card/60 backdrop-blur-md">
          <CardContent className="p-5 flex flex-col h-full space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold text-sm">{t('checker.logs')}</h2>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoscroll}
                    onChange={(e) => setAutoscroll(e.target.checked)}
                    className="rounded border-input text-primary focus:ring-primary"
                  />
                  <span>{t('checker.autoscroll')}</span>
                </label>
                <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => setPaused((p) => !p)}>
                  {paused ? <Play className="h-3 w-3 mr-1" /> : <Pause className="h-3 w-3 mr-1" />}
                  {paused ? t('logs.paused') : t('logs.live')}
                </Button>
                <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs text-destructive" onClick={() => setLogs([])}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Terminal View */}
            <div className="flex-1 min-h-[300px] max-h-[350px] overflow-y-auto rounded-lg bg-zinc-950 p-4 font-mono text-[11px] leading-relaxed text-zinc-300 border border-zinc-900 shadow-inner">
              {logs.map((e, i) => (
                <div key={i} className="flex gap-2 py-0.5 border-b border-zinc-900/30 hover:bg-zinc-900/20">
                  <span className="shrink-0 text-zinc-600">{new Date(e.ts).toLocaleTimeString()}</span>
                  <span className={cn("shrink-0 font-bold uppercase text-[9px] px-1 border rounded border-zinc-800", LEVEL_COLOR[e.level])}>
                    {e.level}
                  </span>
                  <span className={cn("flex-1 whitespace-pre-wrap select-text", LEVEL_COLOR[e.level])}>
                    {e.message}
                  </span>
                </div>
              ))}
              {!logs.length && (
                <div className="h-full flex items-center justify-center text-zinc-600 italic select-none">
                  {t('checker.noLogs')}
                </div>
              )}
              <div ref={terminalEndRef} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
