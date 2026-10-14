import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { SlideOver } from '@/components/SlideOver';

interface Result {
  ok: boolean;
  ms: number;
  status?: number;
  port?: number;
  error?: string;
  ip?: string;
  country?: string;
  countryCode?: string;
  isp?: string;
}

/** Test réel d'un compte proxy : requête via le moteur → IP de sortie, pays, opérateur, latence. */
export function TestAccountDialog({ account, onClose }: { account: { id: string; username: string } | null; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [result, setResult] = useState<Result | null>(null);
  const [failed, setFailed] = useState('');

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setResult(null);
    setFailed('');
    api
      .post(`/system/test-account/${account.id}`, {}, { timeout: 45000 })
      .then((r) => {
        if (cancelled) return;
        setResult(r.data.result);
        if (r.data.result?.ok) qc.invalidateQueries({ queryKey: ['onboarding'] });
      })
      .catch((e) => !cancelled && setFailed(e?.response?.data?.message || e?.message || 'error'));
    return () => {
      cancelled = true;
    };
  }, [account, qc]);

  const reason = (r: Result) => {
    if (r.status === 407) return t('test.err.407');
    if (r.status === 403) return t('test.err.403');
    if (r.status === 429) return t('test.err.429');
    if (r.status && r.status >= 500) return t('test.err.5xx');
    if (r.error === 'timeout') return t('test.err.timeout');
    if (r.error === 'ECONNREFUSED') return t('test.err.ECONNREFUSED');
    if (r.error === 'badresponse') return t('test.err.badresponse');
    return t('test.err.other').replace('{code}', r.status ? `HTTP ${r.status}` : r.error || '?');
  };

  return (
    <SlideOver open={!!account} onClose={onClose} title={`${t('test.title')} — ${account?.username ?? ''}`}>
      <div className="space-y-4 p-4 text-sm">
        {!result && !failed && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('test.running')}
          </div>
        )}
        {failed && (
          <div className="flex items-start gap-2 text-destructive">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{failed}</span>
          </div>
        )}
        {result?.ok && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
              {t('test.ok')}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-muted-foreground">{t('test.ip')}</dt>
              <dd className="font-mono">{result.ip}</dd>
              <dt className="text-muted-foreground">{t('test.country')}</dt>
              <dd>{[result.countryCode, result.country].filter(Boolean).join(' — ')}</dd>
              <dt className="text-muted-foreground">{t('test.isp')}</dt>
              <dd>{result.isp}</dd>
              <dt className="text-muted-foreground">{t('test.latency')}</dt>
              <dd>{result.ms} ms</dd>
            </dl>
          </div>
        )}
        {result && !result.ok && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-semibold text-destructive">
              <XCircle className="h-5 w-5" />
              {t('test.fail')}
            </div>
            <p className="text-muted-foreground">{reason(result)}</p>
          </div>
        )}
        <p className="border-t pt-3 text-xs text-muted-foreground">{t('test.note')}</p>
      </div>
    </SlideOver>
  );
}
