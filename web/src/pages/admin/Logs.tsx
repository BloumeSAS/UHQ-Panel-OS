import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Trash2 } from 'lucide-react';
import { getToken } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Badge, Button, Card, CardContent } from '@/components/ui';
import { cn } from '@/lib/utils';

interface LogEntry {
  ts: number;
  level: string;
  context?: string;
  message: string;
}

const LEVEL_COLOR: Record<string, string> = {
  error: 'text-destructive',
  warn: 'text-yellow-500',
  log: 'text-foreground',
  debug: 'text-muted-foreground',
  verbose: 'text-muted-foreground',
};

export default function Logs() {
  const t = useT();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [level, setLevel] = useState('');
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const bottomRef = useRef<HTMLDivElement>(null);

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
    if (!paused) bottomRef.current?.scrollIntoView();
  }, [entries, paused]);

  const filtered = level ? entries.filter((e) => e.level === level) : entries;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('logs.title')}</h1>
        <div className="flex items-center gap-2">
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
                {e.context && <span className="shrink-0 text-primary">[{e.context}]</span>}
                <span className={LEVEL_COLOR[e.level]}>{e.message}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
