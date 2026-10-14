import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Info, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Button, Card, CardContent } from '@/components/ui';
import { cn } from '@/lib/utils';

type Status = 'ok' | 'warn' | 'fail' | 'info';
interface Check {
  id: string;
  status: Status;
  data?: Record<string, any>;
}
interface Result {
  checks: Check[];
  summary: { worst: Status; fail: number; warn: number };
}

const ICON: Record<Status, { icon: React.ElementType; cls: string }> = {
  ok: { icon: CheckCircle2, cls: 'text-emerald-500' },
  warn: { icon: AlertCircle, cls: 'text-amber-500' },
  fail: { icon: XCircle, cls: 'text-destructive' },
  info: { icon: Info, cls: 'text-muted-foreground' },
};

/** Remplace {clé} par la valeur correspondante (tableaux joints par une virgule). */
function fill(text: string, data?: Record<string, any>) {
  return text.replace(/\{(\w+)\}/g, (_, k) => {
    if (k === 'heartbeat') return data?.heartbeat ? ' + heartbeat' : '';
    const v = data?.[k];
    return v === undefined || v === null ? '—' : Array.isArray(v) ? v.join(', ') : String(v);
  });
}

export default function Diagnostics() {
  const t = useT();
  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ['diagnostics'],
    queryFn: async () => (await api.get('/system/diagnostics', { timeout: 40000 })).data as Result,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  const message = (c: Check) => {
    const reason = c.data?.reason as string | undefined;
    const candidates = [`diag.${c.id}.${reason ?? c.status}`, `diag.${c.id}.${c.status}`];
    const key = candidates.find((k) => t(k) !== k);
    return key ? fill(t(key), c.data) : '';
  };

  const sum = data?.summary;
  const summaryText = !sum
    ? ''
    : sum.fail > 0
      ? fill(t('diag.summary.fail'), sum)
      : sum.warn > 0
        ? fill(t('diag.summary.warn'), sum)
        : t('diag.summary.ok');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('diag.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('diag.subtitle')}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          {t('diag.run')}
        </Button>
      </div>

      {sum && (
        <div
          className={cn(
            'rounded-xl border p-4 text-sm font-medium',
            sum.fail > 0
              ? 'border-destructive/40 bg-destructive/5'
              : sum.warn > 0
                ? 'border-amber-500/40 bg-amber-500/5'
                : 'border-emerald-500/40 bg-emerald-500/5',
          )}
        >
          {summaryText}
        </div>
      )}

      {isFetching && !data && <p className="text-sm text-muted-foreground">{t('diag.running')}</p>}
      {error && !data && <p className="text-sm text-destructive">{String((error as Error).message)}</p>}

      <div className="grid gap-3">
        {data?.checks.map((c) => {
          const { icon: Icon, cls } = ICON[c.status];
          return (
            <Card key={c.id}>
              <CardContent className="flex items-start gap-3 p-4">
                <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', cls)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{t(`diag.${c.id}.t`)}</p>
                    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', cls, 'bg-muted')}>
                      {t(`diag.status.${c.status}`)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{message(c)}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {data && <p className="text-xs text-muted-foreground">{t('diag.note')}</p>}
    </div>
  );
}
