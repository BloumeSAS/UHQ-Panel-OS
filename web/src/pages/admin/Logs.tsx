import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pause, Play, Trash2, FileText, Radio, Download } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Badge, Button, Card, CardContent } from '@/components/ui';
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

  const { data: files } = useQuery({
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

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <Card>
        <CardContent className="p-0">
          <div className="max-h-[70vh] overflow-y-auto divide-y divide-border">
            {!files?.length && (
              <p className="p-4 text-xs text-muted-foreground">{t('logs.noFiles')}</p>
            )}
            {files?.map((f) => (
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
  );
}
