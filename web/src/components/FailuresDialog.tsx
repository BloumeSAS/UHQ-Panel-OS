import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { SlideOver } from '@/components/SlideOver';
import { fillText } from '@/lib/diagMessage';

export interface FailureEvent {
  ts: number;
  ip: string;
  reason: string;
  port: number;
  hint?: string;
  count: number;
}

interface AccountStatus {
  blocked: boolean;
  expired: boolean;
  quotaReached: boolean;
  ipRestricted: boolean;
  dedicatedPort: number | null;
}

/** Texte « quoi faire » d'un refus (réutilisé par la liste globale du Diagnostic). */
export function failureText(t: (k: string) => string, reason: string, hint?: string) {
  const title = t(`fail.reason.${reason}.t`);
  const advice = fillText(t(`fail.reason.${reason}.a`), { hint: hint ?? '?' });
  return { title: title.startsWith('fail.') ? reason : title, advice: advice.startsWith('fail.') ? '' : advice };
}

export const ago = (ts: number) => {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} j`;
};

/**
 * « Pourquoi ça ne marche pas ? » : état courant du compte + dernières connexions refusées avec la cause et la marche à
 * suivre. `mode='admin'` interroge par identifiant, `mode='me'` par id de compte (propriétaire).
 */
export function FailuresDialog({
  target,
  onClose,
}: {
  target: { mode: 'admin' | 'me'; id: string; username: string; label?: string } | null;
  onClose: () => void;
}) {
  const t = useT();
  const [events, setEvents] = useState<FailureEvent[] | null>(null);
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [endpoint, setEndpoint] = useState<{ host: string; port: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setEvents(null);
    setAccount(null);
    setError('');
    const url =
      target.mode === 'admin'
        ? `/monitoring/failures?username=${encodeURIComponent(target.username)}`
        : `/me/proxies/${target.id}/failures`;
    api
      .get(url)
      .then((r) => {
        if (cancelled) return;
        setEvents(r.data.data.events);
        setAccount(r.data.data.account);
        setEndpoint(r.data.data.endpoint);
      })
      .catch((e) => !cancelled && setError(e?.response?.data?.message || e?.message || 'error'));
    return () => {
      cancelled = true;
    };
  }, [target]);

  const problems = account
    ? (['blocked', 'expired', 'quotaReached', 'ipRestricted'] as const).filter((k) => account[k])
    : [];

  return (
    <SlideOver open={!!target} onClose={onClose} title={`${t('fail.title')}${target?.label ? ` — ${target.label}` : ''}`}>
      <div className="space-y-4 p-4 text-sm">
        <p className="text-muted-foreground">{t('fail.intro')}</p>

        {!events && !error && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />…
          </div>
        )}
        {error && <p className="text-destructive">{error}</p>}

        {account && (
          <div className="rounded-lg border p-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('fail.now')}</p>
            {problems.length === 0 ? (
              <p className="flex items-start gap-2 text-emerald-600">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                {t('fail.now.ok')}
              </p>
            ) : (
              <ul className="space-y-1">
                {problems.map((k) => (
                  <li key={k} className="flex items-start gap-2 text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {t(`fail.now.${k}`)}
                  </li>
                ))}
              </ul>
            )}
            {endpoint && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t('fail.endpoint')} : <span className="font-mono">{endpoint.host}:{account.dedicatedPort ?? endpoint.port}</span>
              </p>
            )}
          </div>
        )}

        {events && events.length === 0 && (
          <p className="rounded-lg border p-3 text-muted-foreground">
            {fillText(t(target?.mode === 'me' ? 'fail.emptyMe' : 'fail.empty'), { port: String(account?.dedicatedPort ?? endpoint?.port ?? 990) })}
          </p>
        )}

        {events && events.length > 0 && (
          <ul className="space-y-2">
            {events.map((e, i) => {
              const { title, advice } = failureText(t, e.reason, e.hint);
              return (
                <li key={`${e.ts}-${i}`} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{title}</span>
                    <span className="text-xs text-muted-foreground">
                      {ago(e.ts)} · {e.ip} · :{e.port}
                      {e.count > 1 ? ` · ${t('fail.times').replace('{n}', String(e.count))}` : ''}
                    </span>
                  </div>
                  {advice && <p className="mt-1 text-muted-foreground">{advice}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SlideOver>
  );
}
