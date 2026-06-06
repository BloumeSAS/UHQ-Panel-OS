import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useSite } from '@/lib/site';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Switch } from '@/components/ui';
import { Footer } from '@/components/Footer';

export default function Setup() {
  const { db, status, refresh } = useSite();
  const { applyToken } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    siteName: 'UHQ Panel OS by Bloume.fr',
    publicProxyHost: '',
    publicProxyPort: '990',
    registrationEnabled: false,
    email: '',
    password: '',
    // Réglages avancés optionnels
    scraperProxy: '',
    scrapeInterval: '',
    proxyCheckInterval: '',
    checkerConcurrency: '',
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // On n'envoie pas les réglages avancés laissés vides (sinon ils écraseraient
      // les valeurs par défaut côté serveur).
      const payload: Record<string, any> = {};
      for (const [k, v] of Object.entries(form)) {
        if (v === '' && k !== 'siteName' && k !== 'publicProxyPort') continue;
        payload[k] = v;
      }
      const { data } = await axios.post('/api/panel/setup', payload);
      applyToken(data.token, data.user);
      await refresh();
      navigate('/');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  // Sécurité : pas de wizard tant que la base n'est pas configurée.
  if (db && !db.configured) return <Navigate to="/setup/database" replace />;
  // Setup déjà effectué → rediriger vers le login
  if (status?.setupCompleted) return <Navigate to="/login" replace />;

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-muted/30 p-4 pb-16">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <img src="/static/logo.png" alt="logo" className="mb-2 h-12 w-12 rounded" />
          <CardTitle className="text-2xl">{t('setup.title')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('setup.subtitle')}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('setup.siteName')} value={form.siteName} onChange={(v) => set('siteName', v)} placeholder={t('setup.siteNamePlaceholder')} />
              <Field label={t('setup.proxyHost')} value={form.publicProxyHost} onChange={(v) => set('publicProxyHost', v)} placeholder="prx.exemple.com" />
              <Field label={t('setup.proxyPort')} value={form.publicProxyPort} onChange={(v) => set('publicProxyPort', v)} placeholder={t('setup.proxyPortPlaceholder')} />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <Label>{t('setup.enableRegistration')}</Label>
              <Switch checked={form.registrationEnabled} onCheckedChange={(v) => set('registrationEnabled', v)} />
            </div>

            <div className="border-t pt-4">
              <p className="mb-3 text-sm font-medium">{t('setup.adminAccount')}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('auth.email')} type="email" value={form.email} onChange={(v) => set('email', v)} placeholder={t('auth.emailPlaceholder')} required />
                <Field label={t('auth.password')} type="password" value={form.password} onChange={(v) => set('password', v)} placeholder={t('auth.passwordPlaceholder')} required />
              </div>
            </div>

            <div className="border-t pt-4">
              <button
                type="button"
                onClick={() => setShowAdvanced((s) => !s)}
                className="text-sm font-medium text-primary hover:underline"
              >
                {showAdvanced ? '▾' : '▸'} {t('setup.advancedSettings')}
              </button>
              {showAdvanced && (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label={t('pool.fallbackProxy')} value={form.scraperProxy} onChange={(v) => set('scraperProxy', v)} placeholder="http://user:pass@host:port" />
                  <Field label={`${t('nav.scraper')} interval (s)`} value={form.scrapeInterval} onChange={(v) => set('scrapeInterval', v)} placeholder="3600" />
                  <Field label={`${t('nav.checker')} interval (s)`} value={form.proxyCheckInterval} onChange={(v) => set('proxyCheckInterval', v)} placeholder="900" />
                  <Field label={t('settings.concurrency')} value={form.checkerConcurrency} onChange={(v) => set('checkerConcurrency', v)} placeholder="500" />
                </div>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {t('setup.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Footer className="absolute inset-x-0 bottom-0" />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
