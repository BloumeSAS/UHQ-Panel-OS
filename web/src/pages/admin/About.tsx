import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, ExternalLink, CheckCircle2, AlertCircle, Github, History, Rocket, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/dialog';
import { Markdown } from '@/components/Markdown';
import { SupportInfoButton } from '@/components/SupportInfoButton';
import { UPDATE_PENDING_KEY, UPDATE_START_EVENT } from '@/components/UpdateOverlay';

interface Release {
  tag: string;
  name: string;
  body: string;
  url: string;
  publishedAt: string;
  prerelease: boolean;
}

export default function About() {
  const t = useT();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { data } = useQuery({
    queryKey: ['about'],
    queryFn: async () => (await api.get('/about')).data.data as {
      name: string;
      company: string;
      website: string;
      githubUrl: string;
      version: string;
      autoUpdateConfigured?: boolean;
    },
  });

  const [changelogOpen, setChangelogOpen] = useState(false);
  const { data: releases, isLoading: releasesLoading } = useQuery({
    queryKey: ['about-releases'],
    queryFn: async () => (await api.get('/about/releases')).data.data as Release[],
    enabled: changelogOpen,
  });

  const [check, setCheck] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const checkUpdate = async () => {
    setBusy(true);
    try {
      const { data } = await api.get('/about/check-update');
      setCheck(data);
    } finally {
      setBusy(false);
    }
  };

  // Vérifie automatiquement à l'ouverture de la page (admin) pour afficher le bouton de mise à jour.
  useEffect(() => {
    if (isAdmin) void checkUpdate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const { data: onboarding } = useQuery({
    queryKey: ['onboarding'],
    queryFn: async () => (await api.get('/system/onboarding')).data as { backup: { enabled: boolean } },
    enabled: isAdmin,
  });
  const backupEnabled = !!onboarding?.backup?.enabled;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [backupFirst, setBackupFirst] = useState(true);
  const [starting, setStarting] = useState(false);
  const [updateError, setUpdateError] = useState('');

  const startUpdate = async () => {
    setStarting(true);
    setUpdateError('');
    try {
      const { data: res } = await api.post('/about/update', { backupFirst: backupEnabled && backupFirst }, { timeout: 30000 });
      // Le serveur travaille en tâche de fond (sauvegarde puis webhook) : l'écran de progression suit l'avancement.
      const pending = { from: res.fromVersion as string, startedAt: Date.now(), prepare: true };
      try {
        localStorage.setItem(UPDATE_PENDING_KEY, JSON.stringify(pending));
      } catch {
        /* ignore */
      }
      setConfirmOpen(false);
      window.dispatchEvent(new CustomEvent(UPDATE_START_EVENT, { detail: pending }));
    } catch (e: any) {
      const d = e?.response?.data;
      const code = typeof d?.message === 'string' ? d.message : '';
      const key = `update.err.${code}`;
      const known = t(key) !== key;
      setUpdateError((known ? t(key) : t('update.err.other')).replace('{status}', String(d?.status ?? '?')) + (d?.detail ? ` (${d.detail})` : ''));
    } finally {
      setStarting(false);
    }
  };

  const autoUpdate = !!(check?.autoUpdateConfigured ?? data?.autoUpdateConfigured);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t('about.title')}</h1>

      <Card>
        <CardHeader className="items-center text-center">
          <img src="/static/logo.png" alt="logo" className="mb-2 h-16 w-16 rounded" />
          <CardTitle className="text-xl">{data?.name ?? 'UHQ Panel OS'}</CardTitle>
          <p className="text-sm text-muted-foreground">by {data?.company ?? 'Bloume SAS'}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between border-b pb-2 text-sm">
            <span className="text-muted-foreground">{t('about.version')}</span>
            <span className="font-mono font-medium">v{data?.version}</span>
          </div>
          <div className="flex items-center justify-between border-b pb-2 text-sm">
            <span className="text-muted-foreground">{t('about.site')}</span>
            <a
              href={data?.website ?? 'https://bloume.fr'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              Bloume.fr <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="flex items-center justify-between border-b pb-2 text-sm">
            <span className="text-muted-foreground">{t('about.github')}</span>
            <a
              href={data?.githubUrl ?? 'https://github.com/BloumeSAS/UHQ-Panel-OS'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <Github className="h-3.5 w-3.5" /> BloumeSAS/UHQ-Panel-OS <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{t('about.githubHint')}</p>

          <Button variant="outline" onClick={() => setChangelogOpen(true)} className="w-full">
            <History className="h-4 w-4" />
            {t('about.viewChangelog')}
          </Button>

          {isAdmin && <SupportInfoButton className="w-full" />}

          {isAdmin && (
            <Button onClick={checkUpdate} disabled={busy} className="w-full">
              <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
              {t('about.checkUpdate')}
            </Button>
          )}

          {isAdmin && check !== null && (
            <div className="rounded-md border p-3 text-sm">
              {check.configured === false ? (
                <p className="text-muted-foreground">{t('about.notConfigured')}</p>
              ) : check.updateAvailable ? (
                <div className="space-y-2">
                  <p className="flex items-center gap-2 font-medium text-primary">
                    <AlertCircle className="h-4 w-4" /> {t('about.updateAvailable')} (v{check.latest})
                  </p>
                  {check.url && (
                    <a href={check.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {check.url}
                    </a>
                  )}
                  {autoUpdate ? (
                    <Button onClick={() => { setUpdateError(''); setConfirmOpen(true); }} className="w-full">
                      <Rocket className="h-4 w-4" />
                      {t('update.btn')}
                    </Button>
                  ) : (
                    <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">{t('update.notConfigured.t')}</p>
                      <p className="mt-1">{t('update.notConfigured.b')}</p>
                      <Link to="/settings?tab=general" className="mt-2 inline-block font-medium text-primary hover:underline">
                        {t('update.configure')}
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                <p className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-4 w-4" /> {t('about.upToDate')} (v{check.current})
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={(o) => !starting && setConfirmOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('update.confirm.t')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">{t('update.confirm.b')}</p>
            <p>
              <span className="text-muted-foreground">{t('update.confirm.target')} : </span>
              <span className="font-mono font-semibold">v{check?.latest}</span>
            </p>
            {backupEnabled ? (
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={backupFirst} onChange={(e) => setBackupFirst(e.target.checked)} className="mt-0.5" />
                <span>{t('update.confirm.backup')}</span>
              </label>
            ) : (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">{t('update.confirm.noBackup')}</p>
            )}
            {updateError && <p className="text-destructive">{updateError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={starting}>
                {t('common.cancel')}
              </Button>
              <Button onClick={startUpdate} disabled={starting}>
                {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                {starting ? t('update.starting') : t('update.confirm.go')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={changelogOpen} onOpenChange={setChangelogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[85vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>{t('about.changelogTitle')}</DialogTitle>
          </DialogHeader>
          {releasesLoading ? (
            <p className="text-sm text-muted-foreground">{t('app.loading')}</p>
          ) : !releases || releases.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('about.changelogEmpty')}</p>
          ) : (
            <ol className="relative min-w-0 space-y-6 border-l pl-5">
              {releases.map((r) => (
                <li key={r.tag} className="relative min-w-0">
                  <span className="absolute -left-[1.45rem] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-mono text-sm font-semibold text-primary hover:underline break-all">
                      {r.name || r.tag}
                    </a>
                    {r.prerelease && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t('about.prerelease')}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.publishedAt).toLocaleDateString()}
                    </span>
                  </div>
                  {r.body && <Markdown className="mt-1 min-w-0 break-words">{r.body}</Markdown>}
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
