import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Circle, Rocket, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { Button, Card, CardContent } from '@/components/ui';
import { cn } from '@/lib/utils';

const HIDE_KEY = 'uhq_onb_hidden';
const BACKUP_LATER_KEY = 'uhq_onb_backup_later';
const DAY = 24 * 3600 * 1000;

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

interface Onboarding {
  items: { id: string; done: boolean; link: string }[];
  done: number;
  total: number;
  backup: { enabled: boolean; storage: string };
}

/**
 * Tableau de bord (admin) : bandeau « pas de sauvegarde » + carte « Premiers pas »
 * qui coche toute seule les étapes de mise en service.
 */
export function OnboardingChecklist() {
  const t = useT();
  const { user } = useAuth();
  const [hidden, setHidden] = useState(read(HIDE_KEY) === '1');
  const [snoozeUntil, setSnoozeUntil] = useState(Number(read(BACKUP_LATER_KEY) ?? 0));

  const { data } = useQuery({
    queryKey: ['onboarding'],
    queryFn: async () => (await api.get('/system/onboarding')).data as Onboarding,
    enabled: user?.role === 'ADMIN',
    refetchInterval: 30000,
  });
  if (!data) return null;

  const showBackupBanner = !data.backup.enabled && Date.now() > snoozeUntil;
  const complete = data.done >= data.total;

  return (
    <div className="space-y-4" data-tour="onboarding">
      {showBackupBanner && (
        <div className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 sm:flex-row sm:items-center">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <div className="flex-1">
            <p className="text-sm font-semibold">{t('onb.backupBanner.t')}</p>
            <p className="text-sm text-muted-foreground">{t('onb.backupBanner.b')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/settings?tab=backups"
              className="inline-flex h-9 items-center rounded-md bg-destructive px-3 text-sm font-medium text-destructive-foreground hover:opacity-90"
            >
              {t('onb.backupBanner.cta')}
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const until = Date.now() + DAY;
                write(BACKUP_LATER_KEY, String(until));
                setSnoozeUntil(until);
              }}
            >
              {t('onb.later')}
            </Button>
          </div>
        </div>
      )}

      {!hidden && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">{t('onb.title')}</h2>
                <span className="text-xs text-muted-foreground">
                  {t('onb.progress').replace('{done}', String(data.done)).replace('{total}', String(data.total))}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  write(HIDE_KEY, '1');
                  setHidden(true);
                }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
                {t('onb.hide')}
              </button>
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${(data.done / data.total) * 100}%` }} />
            </div>
            {complete && <p className="text-sm text-emerald-600">{t('onb.allDone')}</p>}
            <ul className="grid gap-2 md:grid-cols-2">
              {data.items.map((it) => (
                <li
                  key={it.id}
                  className={cn('flex items-start gap-2.5 rounded-lg border p-3', it.done && 'bg-muted/40')}
                >
                  {it.done ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm font-medium', it.done && 'text-muted-foreground line-through')}>
                      {t(`onb.item.${it.id}`)}
                    </p>
                    {!it.done && <p className="text-xs text-muted-foreground">{t(`onb.item.${it.id}.d`)}</p>}
                  </div>
                  {!it.done && (
                    <Link to={it.link} className="shrink-0 text-xs font-medium text-primary hover:underline">
                      {t('onb.go')}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
