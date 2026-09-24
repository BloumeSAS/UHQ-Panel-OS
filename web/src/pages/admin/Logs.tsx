import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pause, Play, Trash2, FileText, Radio, Download, Info, RefreshCw, AlertCircle, Search } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Badge, Button, Card, CardContent, Input } from '@/components/ui';
import { cn } from '@/lib/utils';

interface LogEntry {
  ts: number;
  level: string;
  context?: string;
  message: string;
  reqId?: string;
}

interface LogFile {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
}

const LEVEL_COLOR: Record<string, string> = {
  error: 'text-destructive',
  warn: 'text-yellow-500',
  log: 'text-foreground',
  debug: 'text-muted-foreground',
  verbose: 'text-muted-foreground',
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1024 ** 2).toFixed(1)} Mo`;
}

export default function Logs() {
  const t = useT();
  const [tab, setTab] = useState<'live' | 'files'>('live');
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [level, setLevel] = useState('');
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const bottomRef = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);

  // Historique du buffer mémoire (jusqu'à 2000 dernières entrées depuis le
  // dernier redémarrage du process) — chargé une fois au montage, avant que
  // le flux SSE ne prenne le relais en direct. Sans ça, l'écran restait vide
  // tant qu'aucune nouvelle ligne n'était émise après ouverture de la page.
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    api.get('/logs?limit=500').then(({ data }) => {
      setEntries(data.data ?? []);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const es = new EventSource(`/api/panel/logs/stream?token=${getToken()}`);
    es.onmessage = (ev) => {
      if (pausedRef.current) return;
      try {
        const entry: LogEntry = JSON.parse(ev.data);
        setEntries((prev) => [...prev.slice(-1500), entry]);
      } catch {
        /* ignore ping */
      }
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    if (!paused && tab === 'live') bottomRef.current?.scrollIntoView();
  }, [entries, paused, tab]);

  const filtered = level ? entries.filter((e) => e.level === level) : entries;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('logs.title')}</h1>
      </div>

      <div className="flex gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setTab('live')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            tab === 'live' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <Radio className="h-3.5 w-3.5" /> {t('logs.tabLive')}
        </button>
        <button
          type="button"
          onClick={() => setTab('files')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            tab === 'files' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <FileText className="h-3.5 w-3.5" /> {t('logs.tabFiles')}
        </button>
      </div>

      {tab === 'live' && (
        <>
          <div className="flex items-center gap-2 justify-end">
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t('logs.all')}</option>
              <option value="log">log</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
              <option value="debug">debug</option>
            </select>
            <Button variant="outline" size="sm" onClick={() => setPaused((p) => !p)}>
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {paused ? t('logs.paused') : t('logs.live')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEntries([])}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="h-[70vh] overflow-auto bg-zinc-950 p-4 font-mono text-xs text-zinc-100">
                {filtered.map((e, i) => (
                  <div key={i} className="flex gap-2 whitespace-pre-wrap py-0.5">
                    <span className="shrink-0 text-zinc-500">{new Date(e.ts).toLocaleTimeString()}</span>
                    <Badge variant="outline" className={cn('shrink-0 border-zinc-700 px-1 py-0', LEVEL_COLOR[e.level])}>
                      {e.level}
                    </Badge>
                    {e.reqId && (
                      <span className="shrink-0 text-zinc-500" title={t('logs.correlationId')}>
                        ({e.reqId.slice(0, 8)})
                      </span>
                    )}
                    {e.context && <span className="shrink-0 text-primary">[{e.context}]</span>}
                    <span className={LEVEL_COLOR[e.level]}>{e.message}</span>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {tab === 'files' && <FilesTab />}
    </div>
  );
}

function FilesTab() {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data: files, isLoading: filesLoading, refetch } = useQuery({
    queryKey: ['log-files'],
    queryFn: async () => (await api.get('/logs/files')).data.data as LogFile[],
    refetchInterval: 30000,
  });

  const { data: content, isLoading } = useQuery({
    queryKey: ['log-file-content', selected],
    queryFn: async () => (await api.get(`/logs/files/${selected}?tail=1000`)).data as { content: string },
    enabled: !!selected,
  });

  const download = (name: string) => {
    window.open(`/api/panel/logs/files/${name}`, '_blank');
  };

  const filtered = (files ?? []).filter((f) => f.name.toLowerCase().includes(search.trim().toLowerCase()));
  const totalSize = (files ?? []).reduce((a, f) => a + f.sizeBytes, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
        <p>
          {t('logs.filesVolumeHint')}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center gap-2 border-b border-border p-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('logs.searchFiles')}
                  className="h-7 pl-6 text-xs"
                />
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => refetch()} title={t('common.refresh')}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            {files && files.length > 0 && (
              <p className="px-3 py-1.5 text-[11px] text-muted-foreground border-b border-border">
                {t('logs.filesCount').replace('{n}', String(files.length)).replace('{size}', formatBytes(totalSize))}
              </p>
            )}
            <div className="max-h-[65vh] overflow-y-auto divide-y divide-border">
              {filesLoading && (
                <p className="p-4 text-xs text-muted-foreground">{t('app.loading')}</p>
              )}
              {!filesLoading && !filtered.length && (
                <div className="flex flex-col items-center gap-2 p-6 text-center">
                  <AlertCircle className="h-6 w-6 text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">
                    {search ? t('common.noResults') : t('logs.noFiles')}
                  </p>
                </div>
              )}
              {filtered.map((f) => (
                <button
                  key={f.name}
                  onClick={() => setSelected(f.name)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors',
                    selected === f.name && 'bg-muted',
                  )}
                >
                  <div className="font-mono font-medium flex items-center gap-1.5">
                    {f.name.startsWith('error-') && <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />}
                    {f.name}
                  </div>
                  <div className="text-muted-foreground mt-0.5">
                    {formatBytes(f.sizeBytes)} · {new Date(f.modifiedAt).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {!selected ? (
              <p className="p-6 text-sm text-muted-foreground">{t('logs.selectFile')}</p>
            ) : (
              <div>
                <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                  <span className="font-mono text-xs">{selected}</span>
                  <Button variant="outline" size="sm" onClick={() => download(selected)}>
                    <Download className="h-3.5 w-3.5" /> {t('common.download')}
                  </Button>
                </div>
                <pre className="h-[65vh] overflow-auto bg-zinc-950 p-4 font-mono text-xs text-zinc-100 whitespace-pre-wrap">
                  {isLoading ? '…' : content?.content || t('logs.emptyFile')}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
