import { useRef, useState } from 'react';
import axios from 'axios';
import { Loader2, Upload, DatabaseBackup, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui';

const BASE = '/api/panel/setup/restore';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmt = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`);
const apiMsg = (e: any) => e?.response?.data?.message || e?.message || '';

interface Status {
  phase: string;
  restoredBytes: number;
  stats: { users: number; accounts: number; proxies: number } | null;
  error: { code: string; message: string } | null;
}

/**
 * Restauration d'une sauvegarde complète (.tar.gz du dossier de données PostgreSQL 16)
 * depuis l'assistant d'installation. Envoi par morceaux (limites proxy/CDN, reprise sur
 * coupure), puis suivi du traitement côté serveur jusqu'au redémarrage.
 */
export function RestoreBackup() {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<'idle' | 'uploading' | 'processing' | 'done'>('idle');
  const [sent, setSent] = useState(0);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');

  const busy = step !== 'idle';

  const uploadChunks = async (f: File, id: string, chunkSize: number) => {
    let offset = 0;
    while (offset < f.size) {
      const blob = f.slice(offset, offset + chunkSize);
      let ok = false;
      for (let attempt = 0; attempt < 4 && !ok; attempt++) {
        try {
          const { data } = await axios.post(`${BASE}/chunk/${id}?offset=${offset}`, blob, {
            headers: { 'Content-Type': 'application/octet-stream' },
            timeout: 180000,
            transformRequest: [(d) => d],
          });
          offset = data.received;
          ok = true;
        } catch (e: any) {
          const resync = e?.response?.status === 409 && typeof e.response.data?.received === 'number';
          if (resync) {
            // Le serveur a déjà reçu ce morceau (réponse perdue) : on se recale.
            offset = e.response.data.received;
            ok = true;
          } else if (e?.response && e.response.status < 500 && e.response.status !== 408) {
            throw e; // erreur définitive (verrouillé, trop gros…)
          } else if (attempt === 3) {
            throw e;
          } else {
            await sleep(1500 * (attempt + 1));
          }
        }
      }
      setSent(offset);
    }
  };

  const waitInstalled = async () => {
    // Le serveur redémarre : on attend qu'il revienne avec l'installation terminée.
    for (let i = 0; i < 150; i++) {
      await sleep(2000);
      try {
        const { data } = await axios.get('/api/panel/setup/status', { timeout: 4000 });
        if (data?.setupCompleted) {
          setStep('done');
          await sleep(800);
          location.href = '/login';
          return;
        }
      } catch {
        /* redémarrage en cours */
      }
    }
    setError(t('restore.timeout'));
    setStep('idle');
  };

  const start = async () => {
    if (!file) return;
    setError('');
    setSent(0);
    setStatus(null);
    setStep('uploading');
    try {
      const { data } = await axios.post(`${BASE}/begin`, { filename: file.name, size: file.size });
      await uploadChunks(file, data.uploadId, data.chunkSize);
      await axios.post(`${BASE}/finish/${data.uploadId}`);
      setStep('processing');
      for (;;) {
        await sleep(1500);
        let s: Status;
        try {
          s = (await axios.get<Status>(`${BASE}/status`, { timeout: 8000 })).data;
        } catch {
          // Redémarrage possible : on laisse waitInstalled() trancher.
          if (status?.phase === 'restarting') break;
          continue;
        }
        setStatus(s);
        if (s.phase === 'error') {
          setError(s.error?.message || t('restore.failed'));
          setStep('idle');
          return;
        }
        if (s.phase === 'restarting') break;
      }
      await waitInstalled();
    } catch (e: any) {
      setError(apiMsg(e) || t('restore.failed'));
      setStep('idle');
    }
  };

  const pct = file ? Math.min(100, Math.round((sent / file.size) * 100)) : 0;
  const phase = status?.phase ?? 'analyzing';

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
        <DatabaseBackup className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>{t('restore.hint')}</p>
      </div>

      <input
        ref={input}
        type="file"
        accept=".gz,.tgz,.tar.gz,application/gzip,application/x-gzip"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setError('');
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition hover:border-primary/60 hover:bg-primary/5 disabled:opacity-60"
      >
        <Upload className="h-6 w-6 text-primary" />
        {file ? (
          <>
            <span className="break-all text-sm font-medium">{file.name}</span>
            <span className="text-xs text-muted-foreground">{fmt(file.size)}</span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">{t('restore.choose')}</span>
        )}
      </button>

      {step === 'uploading' && (
        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            {t('restore.uploading')} {pct}% — {fmt(sent)} / {file ? fmt(file.size) : ''}
          </p>
        </div>
      )}

      {(step === 'processing' || step === 'done') && (
        <div className="flex items-center gap-2 rounded-md border p-3 text-sm">
          {step === 'done' ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
          <div>
            <p className="font-medium">{step === 'done' ? t('restore.done') : t(`restore.phase.${phase}`)}</p>
            {phase === 'restoring' && status && status.restoredBytes > 0 && (
              <p className="text-xs text-muted-foreground">{fmt(status.restoredBytes)}</p>
            )}
            {status?.stats && (
              <p className="text-xs text-muted-foreground">
                {t('restore.found')
                  .replace('{users}', String(status.stats.users))
                  .replace('{accounts}', String(status.stats.accounts))
                  .replace('{proxies}', String(status.stats.proxies))}
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <Button type="button" className="w-full" disabled={!file || busy} onClick={start}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {t('restore.start')}
      </Button>
    </div>
  );
}
