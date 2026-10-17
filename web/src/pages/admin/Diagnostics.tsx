import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Info, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Button, Card, CardContent } from '@/components/ui';
import { SupportInfoButton } from '@/components/SupportInfoButton';
import { fillText } from '@/lib/diagMessage';
import { ago, failureText } from '@/components/FailuresDialog';
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

const fill = fillText;

export default function Diagnostics() {
  const t = useT();
  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ['diagnostics'],
    queryFn: async () => (await api.get('/system/diagnostics', { timeout: 40000 })).data as Result,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  const { data: failures } = useQuery({
    queryKey: ['failures-recent'],
    queryFn: async () => (await api.get('/monitoring/failures')).data.data.events as { ts: number; ip: string; reason: string; hint?: string; count: number; username: string; known: boolean }[],
    refetchInterval: 15000,
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
        <div className="flex flex-wrap gap-2">
          <SupportInfoButton />
          <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {t('diag.run')}
          </Button>
        </div>
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
        {data?.checks.map((c, idx) => {
          const { icon: Icon, cls } = ICON[c.status];
          return (
            <Card key={`${c.id}-${idx}`}>
              <CardContent className="flex items-start gap-3 p-4">
                <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', cls)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{fill(t(`diag.${c.id}.t`), c.data)}</p>
                    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', cls, 'bg-muted')}>
                      {t(`diag.status.${c.status}`)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{message(c)}</p>
                  {(c.id === 'dns' || c.id === 'poolDns') && c.status !== 'ok' && c.data?.host && <DnsHowTo host={String(c.data.host)} ip={String(c.data.serverIp ?? '')} cloudflare={c.data.reason === 'cloudflare'} />}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {data && <p className="text-xs text-muted-foreground">{t('diag.note')}</p>}

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">{t('fail.recent')}</h2>
          {!failures || failures.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('fail.recentEmpty')}</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card text-muted-foreground">
                  <tr>
                    <th className="py-1.5 text-left font-medium">{t('fail.col.time')}</th>
                    <th className="py-1.5 text-left font-medium">{t('fail.col.account')}</th>
                    <th className="py-1.5 text-left font-medium">{t('fail.col.cause')}</th>
                    <th className="py-1.5 text-left font-medium">{t('fail.col.ip')}</th>
                  </tr>
                </thead>
                <tbody>
                  {failures.map((e, i) => (
                    <tr key={`${e.ts}-${i}`} className="border-t border-border/60">
                      <td className="py-1.5 whitespace-nowrap">{ago(e.ts)}</td>
                      <td className="py-1.5 font-mono">{e.known ? e.username : <span className="text-muted-foreground">{t('fail.unknownAccount')}</span>}</td>
                      <td className="py-1.5">
                        {failureText(t, e.reason, e.hint).title}
                        {e.count > 1 ? <span className="text-muted-foreground"> ×{e.count}</span> : null}
                      </td>
                      <td className="py-1.5 font-mono">{e.ip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Enregistrement DNS à créer, prêt à copier (type A vers l'IP publique de ce serveur). */
function DnsHowTo({ host, ip, cloudflare }: { host: string; ip: string; cloudflare: boolean }) {
  const t = useT();
  const known = /^[0-9a-f.:]{3,45}$/i.test(ip);
  const type = ip.includes(':') ? 'AAAA' : 'A';
  const copy = (v: string) => {
    void navigator.clipboard?.writeText(v);
  };
  return (
    <div className="mt-3 space-y-2 rounded-lg border bg-muted/30 p-3 text-xs">
      <p className="font-semibold">{t('diag.dnsHowTo.title')}</p>
      {known ? (
        <table className="w-full font-mono">
          <thead className="text-muted-foreground"><tr><th className="text-left font-medium">{t('diag.dnsHowTo.type')}</th><th className="text-left font-medium">{t('diag.dnsHowTo.name')}</th><th className="text-left font-medium">{t('diag.dnsHowTo.value')}</th><th className="text-left font-medium">{t('diag.dnsHowTo.proxy')}</th></tr></thead>
          <tbody>
            <tr>
              <td>{type}</td>
              <td><button type="button" className="underline-offset-2 hover:underline" onClick={() => copy(host)} title={t('common.copy')}>{host}</button></td>
              <td><button type="button" className="underline-offset-2 hover:underline" onClick={() => copy(ip)} title={t('common.copy')}>{ip}</button></td>
              <td>{t('diag.dnsHowTo.dnsOnly')}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="text-muted-foreground">{t('diag.dnsHowTo.unknownIp')}</p>
      )}
      <ol className="list-decimal space-y-0.5 pl-4 text-muted-foreground">
        <li>{t('diag.dnsHowTo.s1')}</li>
        <li>{cloudflare ? t('diag.dnsHowTo.s2cf') : t('diag.dnsHowTo.s2')}</li>
        <li>{t('diag.dnsHowTo.s3')}</li>
      </ol>
    </div>
  );
}
