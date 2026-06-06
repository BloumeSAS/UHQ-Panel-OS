import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';

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
      version: string;
    },
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
    </div>
  );
}
