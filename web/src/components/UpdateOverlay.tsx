import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, CheckCircle2, Loader2, Circle } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

export const UPDATE_PENDING_KEY = 'uhq_update_pending';
const MIN_KEY = 'uhq_update_min';
export const UPDATE_START_EVENT = 'uhq-update-start';
const TIMEOUT_MS = 25 * 60_000;

type Phase = 'prepare' | 'building' | 'restarting' | 'back' | 'done' | 'sameversion' | 'timeout' | 'error';

interface Pending {
  from: string;
  startedAt: number;
  /** Le serveur sauvegarde / envoie encore la demande à la plateforme (tâche de fond). */
  prepare?: boolean;
}

const readPending = (): Pending | null => {
  try {
    const raw = localStorage.getItem(UPDATE_PENDING_KEY);
    const p = raw ? (JSON.parse(raw) as Pending) : null;
    // Suivi périmé (onglet rouvert bien plus tard) : on l'abandonne.
    if (p && Date.now() - p.startedAt > 60 * 60_000) { localStorage.removeItem(UPDATE_PENDING_KEY); return null; }
    return p;
  } catch {
    return null;
  }
};
const clearPending = () => {
  try {
    localStorage.removeItem(UPDATE_PENDING_KEY);
  } catch {
    /* ignore */
  }
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Suivi d'une mise à jour automatique : le panel est reconstruit et redémarré par la plateforme
 * (Coolify…). On interroge /health : serveur injoignable = redémarrage ; serveur revenu avec une
 * autre version = terminé (rechargement de la page). L'état survit à un rechargement (localStorage).
 */
export function UpdateOverlay() {
  const t = useT();
  const [pending, setPending] = useState<Pending | null>(readPending);
  const [phase, setPhase] = useState<Phase>('building');
  const [minimized, setMinimized] = useState(() => {
    try { return localStorage.getItem(MIN_KEY) === '1'; } catch { return false; }
  });
  const setMin = (v: boolean) => {
    setMinimized(v);
    try { if (v) localStorage.setItem(MIN_KEY, '1'); else localStorage.removeItem(MIN_KEY); } catch { /* ignore */ }
  };
  const [elapsed, setElapsed] = useState(0);
  const [newVersion, setNewVersion] = useState('');
  const [jobPhase, setJobPhase] = useState<'backup' | 'triggering'>('triggering');
  const [jobError, setJobError] = useState<{ code: string; status?: number } | null>(null);
  const wasDown = useRef(false);
  const startedAt = useRef(0);

  // Démarrage depuis la page À propos.
  useEffect(() => {
    const h = (e: Event) => {
      const p = (e as CustomEvent<Pending>).detail;
      wasDown.current = false;
      setJobError(null);
      setMin(false);
      setPhase(p.prepare ? 'prepare' : 'building');
      setPending(p);
    };
    window.addEventListener(UPDATE_START_EVENT, h);
    return () => window.removeEventListener(UPDATE_START_EVENT, h);
  }, []);

  // Fermer une fenêtre d'erreur / terminée : on arrête le suivi. Pendant la mise à jour, « Masquer » la réduit en pastille.
  const close = useCallback(() => {
    clearPending();
    try { localStorage.removeItem(MIN_KEY); } catch { /* ignore */ }
    setMinimized(false);
    setPending(null);
  }, []);

  // Phase de préparation : le serveur sauvegarde puis appelle le webhook en tâche de fond (évite les coupures
  // Cloudflare des requêtes longues). On suit son avancement jusqu'à « done » ou « error ».
  useEffect(() => {
    if (!pending?.prepare) return;
    let stopped = false;
    setPhase('prepare');
    const poll = async () => {
      try {
        const { data } = await api.get('/about/update-status', { timeout: 8000 });
        const job = data?.job;
        if (stopped || !job) return;
        if (job.phase === 'backup' || job.phase === 'triggering') setJobPhase(job.phase);
        if (job.phase === 'done') {
          stopped = true;
          const next = { ...pending, prepare: false, startedAt: Date.now() };
          try {
            localStorage.setItem(UPDATE_PENDING_KEY, JSON.stringify(next));
          } catch {
            /* ignore */
          }
          setPending(next);
          setPhase('building');
        } else if (job.phase === 'error') {
          stopped = true;
          setJobError(job.error ?? { code: 'other' });
          setPhase('error');
          clearPending();
        }
      } catch {
        /* réessaiera */
      }
    };
    void poll();
    const id = setInterval(poll, 1500);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [pending]);

  useEffect(() => {
    if (!pending || pending.prepare) return;
    startedAt.current = pending.startedAt;
    let stopped = false;
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (stopped) return;
      setElapsed(Math.round((Date.now() - startedAt.current) / 1000));
      try {
        // Sans en-tête d'auth : /health est public. Cache désactivé pour ne jamais lire une réponse périmée.
        const { data } = await axios.get('/health', { timeout: 4000, headers: { 'Cache-Control': 'no-cache' }, params: { _: Date.now() } });
        const v: string | undefined = data?.version;
        if (v && v !== pending.from) {
          setNewVersion(v);
          setPhase('done');
          stopped = true;
          clearPending();
          reloadTimer = setTimeout(() => window.location.reload(), 2500);
          return;
        }
        if (wasDown.current) setPhase('sameversion');
        else if (Date.now() - startedAt.current > TIMEOUT_MS) setPhase('timeout');
        else setPhase('building');
      } catch {
        wasDown.current = true;
        setPhase('restarting');
      }
    };
    void tick();
    const id = setInterval(tick, 3000);
    return () => {
      stopped = true;
      clearInterval(id);
      if (reloadTimer) clearTimeout(reloadTimer);
    };
  }, [pending]);

  if (!pending) return null;

  const preparing = phase === 'prepare' || phase === 'error';
  const steps: { key: string; state: 'done' | 'active' | 'todo' }[] = [
    { key: preparing ? 'prepare' : 'trigger', state: phase === 'error' ? 'todo' : preparing ? 'active' : 'done' },
    {
      key: 'build',
      state: preparing ? 'todo' : phase === 'building' || phase === 'timeout' ? 'active' : 'done',
    },
    {
      key: 'restart',
      state: phase === 'restarting' ? 'active' : preparing || phase === 'building' || phase === 'timeout' ? 'todo' : 'done',
    },
    {
      key: 'reconnect',
      state: phase === 'done' ? 'done' : phase === 'sameversion' || phase === 'back' ? 'active' : 'todo',
    },
  ];

  const warn = phase === 'sameversion' || phase === 'timeout' || phase === 'error';

  // Réduite en pastille en bas à gauche tant que ça tourne ; un événement important (fin, erreur, délai) rouvre la fenêtre.
  if (minimized && !warn && phase !== 'done') {
    return (
      <button
        type="button"
        onClick={() => setMin(false)}
        className="fixed bottom-4 left-4 z-[110] flex items-center gap-2 rounded-full border bg-popover px-3.5 py-2 text-sm font-medium shadow-lg transition-colors hover:bg-accent"
        aria-label={t('update.reopen')}
        title={t('update.reopen')}
      >
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>{t('update.running')}</span>
        <span className="font-mono text-xs text-muted-foreground">{fmt(elapsed)}</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm" role="alertdialog" aria-live="polite">
      <div className="w-full max-w-md space-y-5 rounded-2xl border bg-popover p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          {phase === 'done' ? (
            <CheckCircle2 className="h-7 w-7 text-emerald-500" />
          ) : warn ? (
            <AlertTriangle className="h-7 w-7 text-amber-500" />
          ) : (
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          )}
          <div>
            <h2 className="text-lg font-semibold">
              {phase === 'done' ? t('update.done').replace('{v}', newVersion) : t('update.title')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {phase === 'done'
                ? t('update.reloading')
                : phase === 'error'
                  ? (t(`update.err.${jobError?.code}`) !== `update.err.${jobError?.code}` ? t(`update.err.${jobError?.code}`) : t('update.err.other')).replace('{status}', String(jobError?.status ?? '?'))
                  : phase === 'prepare'
                    ? t(`update.phase.${jobPhase}`)
                    : phase === 'sameversion'
                  ? t('update.sameVersion')
                  : phase === 'timeout'
                    ? t('update.timeout')
                    : t(`update.phase.${phase}`)}
            </p>
          </div>
        </div>

        <ul className="space-y-2 text-sm">
          {steps.map((s) => (
            <li key={s.key} className="flex items-center gap-2.5">
              {s.state === 'done' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : s.state === 'active' ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              )}
              <span className={cn(s.state === 'todo' && 'text-muted-foreground')}>{t(`update.step.${s.key}`)}</span>
            </li>
          ))}
        </ul>

        {phase !== 'done' && phase !== 'error' && (
          <>
            <div className="h-1.5 overflow-hidden rounded bg-muted">
              <div className="h-full w-1/3 animate-pulse rounded bg-primary" />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('update.elapsed')} {fmt(elapsed)} — {t('update.dontClose')}
            </p>
          </>
        )}

        {(warn || phase === 'building' || phase === 'prepare') && (
          <div className="flex justify-end gap-2">
            {phase === 'timeout' && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const p = { ...pending, startedAt: Date.now() };
                  try {
                    localStorage.setItem(UPDATE_PENDING_KEY, JSON.stringify(p));
                  } catch {
                    /* ignore */
                  }
                  setPending(p);
                }}
              >
                {t('update.keepWaiting')}
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => (warn ? close() : setMin(true))}>
              {warn ? t('update.close') : t('update.hide')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
