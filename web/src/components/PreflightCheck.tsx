import { useState } from 'react';
import axios from 'axios';
import { AlertCircle, CheckCircle2, Info, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui';
import { diagMessage, type DiagCheck, type CheckStatus } from '@/lib/diagMessage';
import { cn } from '@/lib/utils';

const ICON: Record<CheckStatus, { icon: React.ElementType; cls: string }> = {
  ok: { icon: CheckCircle2, cls: 'text-emerald-500' },
  warn: { icon: AlertCircle, cls: 'text-amber-500' },
  fail: { icon: XCircle, cls: 'text-destructive' },
  info: { icon: Info, cls: 'text-muted-foreground' },
};

/** Installation guidée : vérifie le domaine saisi (DNS, Cloudflare, port) AVANT de terminer l'installation. */
export function PreflightCheck({ host, port }: { host: string; port: string }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<DiagCheck[] | null>(null);
  const [error, setError] = useState('');

  const run = async () => {
    setError('');
    if (!host.trim()) {
      setError(t('preflight.noHost'));
      return;
    }
    setBusy(true);
    try {
      const { data } = await axios.get('/api/panel/setup/preflight', { params: { host: host.trim(), port: port || '990' }, timeout: 30000 });
      setChecks(data.checks);
    } catch (e: any) {
      setChecks(null);
      setError(t('preflight.failed').replace('{msg}', e?.response?.data?.message || e?.message || 'error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={run} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
          {busy ? t('preflight.running') : t('preflight.btn')}
        </Button>
        <span className="text-xs text-muted-foreground">{t('preflight.hint')}</span>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {checks && (
        <ul className="space-y-1.5 rounded-lg border p-3">
          {checks.map((c) => {
            const { icon: Icon, cls } = ICON[c.status];
            const title = t(`diag.${c.id}.t`);
            return (
              <li key={c.id} className="flex items-start gap-2 text-xs">
                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', cls)} />
                <span>
                  <span className="font-medium">{title}</span> — <span className="text-muted-foreground">{diagMessage(t, c)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
