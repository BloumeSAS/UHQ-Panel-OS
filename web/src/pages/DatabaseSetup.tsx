import { useState } from 'react';
import axios from 'axios';
import { Database, Server } from 'lucide-react';
import { useSite } from '@/lib/site';
import { useT } from '@/lib/i18n';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui';
import { Footer } from '@/components/Footer';

/**
 * Premier démarrage, base non configurée. Deux options :
 *  - Auto-hébergée Docker (info : utiliser le compose fourni qui connecte tout seul).
 *  - Connexion externe : saisir le lien, on teste, applique le schéma, persiste et redémarre.
 */
export default function DatabaseSetup() {
  const { refresh } = useSite();
  const t = useT();
  const [mode, setMode] = useState<'fields' | 'url'>('fields');
  const [url, setUrl] = useState('');
  const [f, setF] = useState({
    host: '',
    port: '',
    database: '',
    user: '',
    password: '',
    options: '',
  });
  const setField = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'idle' | 'connecting' | 'restarting'>('idle');

  // Assemble une URL PostgreSQL depuis les champs (user/pass encodés).
  const buildUrl = (maskPassword = false) => {
    const pass = f.password ? ':' + (maskPassword ? '••••' : encodeURIComponent(f.password)) : '';
    const auth = f.user ? `${encodeURIComponent(f.user)}${pass}@` : '';
    const opts = f.options.trim() ? `?${f.options.trim().replace(/^\?/, '')}` : '';
    const db = f.database.trim() || 'uhqpanel';
    return `postgresql://${auth}${f.host.trim()}:${f.port.trim() || '5432'}/${db}${opts}`;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPhase('connecting');
    try {
      const databaseUrl = mode === 'url' ? url.trim() : buildUrl();
      await axios.post('/api/panel/setup/db', { databaseUrl }, { timeout: 45000 });
      setPhase('restarting');
      // Le backend redémarre : on attend qu'il revienne configuré.
      await waitConfigured();
      await refresh();
      location.href = '/setup';
    } catch (err: any) {
      // Affiche la VRAIE erreur (message backend + statut) pour diagnostiquer.
      const data = err?.response?.data;
      const status = err?.response?.status;
      let msg = (data && (data.message || data.error)) || '';
      // 500 sans message = API injoignable / pas (re)démarrée derrière le proxy.
      if (!msg && status === 500) {
        msg = t('db.apiUnavailable');
      }
      if (!msg) msg = err?.message || t('db.connectionError');
      setError(status ? `(${status}) ${msg}` : msg);
      setPhase('idle');
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-muted/30 p-4 pb-16">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <img src="/static/logo.png" alt="logo" className="mx-auto mb-2 h-12 w-12 rounded" />
          <h1 className="text-2xl font-bold">{t('db.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('db.subtitle')}</p>
        </div>

        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><Server className="h-5 w-5" /></div>
            <CardTitle className="text-base">{t('db.selfhost')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t('db.selfhostDesc')}</p>
            <pre className="mt-3 overflow-auto rounded-md bg-muted p-3 text-xs">docker compose up -d</pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><Database className="h-5 w-5" /></div>
            <CardTitle className="text-base">{t('db.external')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{t('db.externalDesc')}</p>
              <button
                type="button"
                onClick={() => setMode((m) => (m === 'fields' ? 'url' : 'fields'))}
                className="shrink-0 text-xs font-medium text-primary hover:underline"
              >
                {mode === 'fields' ? t('db.useUrl') : t('db.useFields')}
              </button>
            </div>

            <form onSubmit={submit} className="space-y-3">
              {mode === 'url' ? (
                <div className="space-y-1.5">
                  <Label>{t('db.url')}</Label>
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="postgresql://user:pass@host:5432/uhqpanel"
                    required
                    disabled={phase !== 'idle'}
                  />
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>{t('db.host')}</Label>
                      <Input value={f.host} onChange={(e) => setField('host', e.target.value)} placeholder={t('db.hostPlaceholder')} required disabled={phase !== 'idle'} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('db.port')}</Label>
                      <Input value={f.port} onChange={(e) => setField('port', e.target.value)} placeholder={t('db.portPlaceholder')} disabled={phase !== 'idle'} />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>{t('db.user')}</Label>
                      <Input value={f.user} onChange={(e) => setField('user', e.target.value)} placeholder={t('db.userPlaceholder')} required disabled={phase !== 'idle'} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('db.password')}</Label>
                      <Input type="password" value={f.password} onChange={(e) => setField('password', e.target.value)} placeholder={t('db.passwordPlaceholder')} disabled={phase !== 'idle'} />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>{t('db.database')}</Label>
                      <Input value={f.database} onChange={(e) => setField('database', e.target.value)} placeholder={t('db.databasePlaceholder')} disabled={phase !== 'idle'} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('db.options')}</Label>
                      <Input value={f.options} onChange={(e) => setField('options', e.target.value)} placeholder={t('db.optionsPlaceholder')} disabled={phase !== 'idle'} />
                    </div>
                  </div>
                  <p className="break-all font-mono text-xs text-muted-foreground">{buildUrl(true)}</p>
                </>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              {phase === 'connecting' && <p className="text-sm text-muted-foreground">{t('db.connecting')}</p>}
              {phase === 'restarting' && <p className="text-sm text-primary">{t('db.restarting')}</p>}
              <Button type="submit" disabled={phase !== 'idle'}>{t('db.connect')}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <Footer className="absolute inset-x-0 bottom-0" />
    </div>
  );
}

/** Sonde db-status jusqu'à ce que la base soit configurée (après redémarrage). */
async function waitConfigured(timeoutMs = 60000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const { data } = await axios.get('/api/panel/setup/db-status');
      if (data.configured) return;
    } catch {
      /* backend en cours de redémarrage */
    }
  }
}
