import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, ExternalLink, CheckCircle2, AlertCircle, Github, History } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/dialog';
import { Markdown } from '@/components/Markdown';

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

      <Dialog open={changelogOpen} onOpenChange={setChangelogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('about.changelogTitle')}</DialogTitle>
          </DialogHeader>
          {releasesLoading ? (
            <p className="text-sm text-muted-foreground">{t('app.loading')}</p>
          ) : !releases || releases.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('about.changelogEmpty')}</p>
          ) : (
            <ol className="relative space-y-6 border-l pl-5">
              {releases.map((r) => (
                <li key={r.tag} className="relative">
                  <span className="absolute -left-[1.45rem] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-mono text-sm font-semibold text-primary hover:underline">
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
                  {r.body && <Markdown className="mt-1">{r.body}</Markdown>}
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
