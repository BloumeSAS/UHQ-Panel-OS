import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/dialog';

interface Result {
  ok: boolean;
  exportedAt?: string | null;
  version?: string | null;
  sizeBytes?: number;
  tables: Record<string, number>;
  issues: { level: 'error' | 'warn'; message: string }[];
  durationMs: number;
}

const fmtSize = (n?: number) => (n == null ? '—' : n > 1e9 ? `${(n / 1e9).toFixed(2)} Go` : `${(n / 1e6).toFixed(1)} Mo`);

/** Vérification (lecture seule) qu'une sauvegarde est restaurable : structure, schéma, dates, doublons, cohérence. */
export function BackupVerifyDialog({ filename, onClose }: { filename: string | null; onClose: () => void }) {
  const t = useT();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!filename) return;
    let cancelled = false;
    setResult(null);
    setError('');
    api
      .post('/backup/verify', { filename }, { timeout: 300000 })
      .then((r) => {
        if (cancelled) return;
        if (r.data?.status === 'success') setResult(r.data.result);
        else setError(r.data?.message || t('verify.failed'));
      })
      .catch((e) => !cancelled && setError(e?.response?.data?.message || t('verify.failed')));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename]);

  return (
    <Dialog open={!!filename} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('verify.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="break-all font-mono text-xs text-muted-foreground">{filename}</p>

          {!result && !error && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('verify.running')}
            </div>
          )}
          {error && <p className="text-destructive">{error}</p>}

          {result && (
            <>
              <div className={`flex items-center gap-2 font-semibold ${result.ok ? 'text-emerald-600' : 'text-destructive'}`}>
                {result.ok ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                {result.ok ? t('verify.ok') : t('verify.ko')}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted-foreground">{t('verify.exported')}</dt>
                <dd>{result.exportedAt ? new Date(result.exportedAt).toLocaleString() : '—'}</dd>
                <dt className="text-muted-foreground">{t('verify.size')}</dt>
                <dd>{fmtSize(result.sizeBytes)}</dd>
              </dl>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('verify.tables')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(result.tables).map(([k, n]) => (
                    <span key={k} className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">
                      {k} : {n.toLocaleString()}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('verify.issues')}</p>
                {result.issues.length === 0 ? (
                  <p className="text-muted-foreground">{t('verify.none')}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {result.issues.map((i, n) => (
                      <li key={n} className={`flex items-start gap-2 ${i.level === 'error' ? 'text-destructive' : 'text-amber-600'}`}>
                        {i.level === 'error' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                        {i.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="border-t pt-3 text-xs text-muted-foreground">{t('verify.note')}</p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
