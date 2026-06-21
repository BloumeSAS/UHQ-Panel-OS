import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Copy, Eye, EyeOff, RefreshCw, Send,
  Globe, Server, Radio, Shield, Mail, Key,
  Bell, Database, Trash2, Download, Upload,
} from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { useT, useI18n } from '@/lib/i18n';
import { useSite } from '@/lib/site';
import { Button, Input, Label, Switch } from '@/components/ui';
import { cn } from '@/lib/utils';

// ── Tabs definition ──────────────────────────────────────────────────────────
const TABS = [
  { key: 'general',  icon: Globe,   labelKey: 'settings.general' },
  { key: 'proxy',    icon: Server,  labelKey: 'settings.proxy' },
  { key: 'scraper',  icon: Radio,   labelKey: 'settings.scraper' },
  { key: 'smtp',     icon: Mail,    labelKey: 'settings.smtp' },
  { key: 'captcha',  icon: Shield,  labelKey: 'settings.captcha' },
  { key: 'webhooks', icon: Bell,    labelKey: 'settings.webhooks' },
  { key: 'backups',  icon: Database, labelKey: 'settings.backups' },
  { key: 'apikey',   icon: Key,     labelKey: 'settings.apiKey' },
] as const;

type TabKey = typeof TABS[number]['key'];

const CAPTCHA_PROVIDERS = ['none', 'hcaptcha', 'recaptcha', 'turnstile', 'cap'];
const REPORT_FREQUENCIES = [
  { value: 'daily',   labelKey: 'settings.freqDaily' },
  { value: 'weekly',  labelKey: 'settings.freqWeekly' },
  { value: 'monthly', labelKey: 'settings.freqMonthly' },
];

export default function Settings() {
  const t = useT();
  const { languages } = useI18n();
  const { refresh } = useSite();
  const [tab, setTab] = useState<TabKey>('general');

  const { data, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data.data as Record<string, any>,
  });
  const [form, setForm] = useState<Record<string, any>>({});
  const [msg, setMsg]   = useState('');
  const [error, setError] = useState('');

  // Backup queries and actions
  const { data: backupsList, refetch: refetchBackups } = useQuery({
    queryKey: ['backups'],
    queryFn: async () => (await api.get('/backup/list')).data.data as any[],
    enabled: tab === 'backups',
  });

  const [backupBusy, setBackupBusy] = useState(false);

  useEffect(() => { if (data) setForm(data); }, [data]);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const SECRETS = [
    'scraperProxy',
    'groqApiKey',
    'smtpPass',
    'captchaSecretKey',
    'discordWebhookUrl',
    'slackWebhookUrl',
    'bloumechatWebhookUrl',
    'backupS3SecretKey',
  ];

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(''); setError('');
    try {
      const payload: Record<string, any> = { ...form };
      for (const s of SECRETS)
        if (typeof payload[s] === 'string' && /^•+$/.test(payload[s])) delete payload[s];
      for (const b of [
        'registrationEnabled',
        'smtpSecure',
        'emailOnRegister',
        'emailOnLogin',
        'emailResetEnabled',
        'smtpReportsEnabled',
        'maintenanceModeEnabled',
        'discordAlertsEnabled',
        'slackAlertsEnabled',
        'bloumechatAlertsEnabled',
        'backupDatabaseEnabled',
        'invitationsEnabled',
        'skipDeadProxies',
      ])
        payload[b] = payload[b] === true || payload[b] === 'true';
      await api.put('/settings', payload);
      setMsg(t('settings.saved'));
      await Promise.all([refetch(), refresh()]);
    } catch (err) { setError(apiError(err)); }
  };

  const handleExportSettings = async () => {
    setMsg(''); setError('');
    try {
      const res = await api.get('/backup/settings/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'settings-export.json');
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      setMsg(t('settings.exported'));
    } catch (err) { setError(apiError(err)); }
  };

  const handleImportSettings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg(''); setError('');
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const settingsJson = event.target?.result as string;
        await api.post('/backup/settings/import', { settingsJson });
        setMsg(t('settings.imported'));
        refetch();
      } catch (err) { setError(apiError(err)); }
    };
    reader.readAsText(file);
  };

  const handleRunBackup = async () => {
    setBackupBusy(true); setMsg(''); setError('');
    try {
      await api.post('/backup/run');
      setMsg(t('settings.backupCreated'));
      refetchBackups();
    } catch (err) { setError(apiError(err)); }
    finally { setBackupBusy(false); }
  };

  const handleRestoreBackup = async (filename: string) => {
    if (!confirm(t('settings.confirmRestore').replace('{filename}', filename))) return;
    setBackupBusy(true); setMsg(''); setError('');
    try {
      await api.post('/backup/restore', { filename });
      setMsg(t('settings.backupRestored'));
      await Promise.all([refetch(), refresh(), refetchBackups()]);
    } catch (err) { setError(apiError(err)); }
    finally { setBackupBusy(false); }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!confirm(t('settings.confirmDeleteBackup').replace('{filename}', filename))) return;
    setMsg(''); setError('');
    try {
      await api.delete(`/backup/${filename}`);
      setMsg(t('settings.backupDeleted'));
      refetchBackups();
    } catch (err) { setError(apiError(err)); }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!data) return <p className="text-muted-foreground">{t('app.loading')}</p>;

  return (
    <form onSubmit={save} className="space-y-0">

      {/* ── Header ── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('settings.savedSubtitle')}</p>
      </div>

      {/* ── Feedback ── */}
      {msg   && <div className="mb-4 rounded-md bg-primary/10 border border-primary/20 px-4 py-2 text-sm text-primary">{msg}</div>}
      {error && <div className="mb-4 rounded-md bg-destructive/10 border border-destructive/20 px-4 py-2 text-sm text-destructive">{error}</div>}

      {/* ── Tab bar ── */}
      <div className="flex gap-1 overflow-x-auto border-b pb-0 mb-6 scrollbar-none">
        {TABS.map(({ key, icon: Icon, labelKey }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors',
              tab === key
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {t(labelKey) === labelKey ? labelKey : t(labelKey)}
          </button>
        ))}
      </div>

      {/* ── Panels ── */}
      <div className="space-y-5">

        {/* ────── GÉNÉRAL ────── */}
        {tab === 'general' && (
          <>
            <F label={t('setup.siteName')} hint={t('settings.siteNameHint')}>
              <Input
                value={form.siteName ?? ''}
                onChange={(e) => set('siteName', e.target.value)}
                placeholder={t('setup.siteNamePlaceholder')}
              />
            </F>

            <F label={t('settings.defaultLang')} hint={t('settings.defaultLangHint')}>
              <select
                value={form.defaultLang || 'fr'}
                onChange={(e) => set('defaultLang', e.target.value)}
                className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.nativeName} ({l.name})
                  </option>
                ))}
              </select>
            </F>

            <Separator label={t('settings.accessMaintenance')} />

            <Row>
              <Toggle
                label={t('setup.enableRegistration')}
                hint={t('settings.enableRegistrationHint')}
                k="registrationEnabled" form={form} set={set}
              />
              <Toggle
                label={t('settings.invitationsEnabled')}
                hint={t('settings.invitationsEnabledHint')}
                k="invitationsEnabled" form={form} set={set}
              />
              <Toggle
                label={t('settings.maintenanceMode')}
                hint={t('settings.maintenanceModeHint')}
                k="maintenanceModeEnabled" form={form} set={set}
              />
            </Row>
          </>
        )}

        {/* ────── PROXY PUBLIC ────── */}
        {tab === 'proxy' && (
          <>
            <Grid>
              <F label={t('setup.proxyHost')} hint={t('settings.proxyHostHint')}>
                <Input value={form.publicProxyHost ?? ''} onChange={(e) => set('publicProxyHost', e.target.value)} placeholder="prx.uhq.monster" />
              </F>
              <F label={t('setup.proxyPort')} hint={t('settings.proxyPortHint')}>
                <Input value={form.publicProxyPort ?? ''} onChange={(e) => set('publicProxyPort', e.target.value)} placeholder="990" />
              </F>
              <F label={t('settings.proxyTimeout')} hint={t('settings.proxyTimeoutHint')}>
                <Input value={form.proxyTimeout ?? ''} onChange={(e) => set('proxyTimeout', e.target.value)} placeholder="3" />
              </F>
              <F label={t('settings.proxyRacingTimeout')} hint={t('settings.proxyRacingTimeoutHint')}>
                <Input value={form.proxyRacingTimeout ?? ''} onChange={(e) => set('proxyRacingTimeout', e.target.value)} placeholder="1.5" />
              </F>
            </Grid>
          </>
        )}

        {/* ────── SCRAPER & CHECKER ────── */}
        {tab === 'scraper' && (
          <>
            <Grid>
              <F label={t('settings.scrapeInterval')} hint={t('settings.scrapeIntervalHint')}>
                <Input value={form.scrapeInterval ?? ''} onChange={(e) => set('scrapeInterval', e.target.value)} placeholder="3600" />
              </F>
              <F label={t('settings.proxyCheckInterval')} hint={t('settings.proxyCheckIntervalHint')}>
                <Input value={form.proxyCheckInterval ?? ''} onChange={(e) => set('proxyCheckInterval', e.target.value)} placeholder="900" />
              </F>
              <F label={t('settings.geoInterval')} hint={t('settings.geoIntervalHint')}>
                <Input value={form.geoResolveInterval ?? ''} onChange={(e) => set('geoResolveInterval', e.target.value)} placeholder="600" />
              </F>
              <F label={t('settings.concurrency')} hint={t('settings.concurrencyHint')}>
                <Input value={form.checkerConcurrency ?? ''} onChange={(e) => set('checkerConcurrency', e.target.value)} placeholder="500" />
              </F>
              <F label={t('settings.checkerTimeout')} hint={t('settings.checkerTimeoutHint')}>
                <Input value={form.checkerTimeout ?? ''} onChange={(e) => set('checkerTimeout', e.target.value)} placeholder="5" />
              </F>
              <F label={t('settings.scraperMinPoolSize')} hint={t('settings.scraperMinPoolSizeHint')}>
                <Input value={form.scraperMinPoolSize ?? ''} onChange={(e) => set('scraperMinPoolSize', e.target.value)} placeholder="5000" />
              </F>
            </Grid>

            <Separator label={t('settings.deadProxies')} />

            <Row>
              <Toggle
                label={t('settings.skipDeadProxies')}
                hint={t('settings.skipDeadProxiesHint')}
                k="skipDeadProxies" form={form} set={set}
              />
            </Row>
            {(form.skipDeadProxies === true || form.skipDeadProxies === 'true') && (
              <Grid>
                <F label={t('settings.deadProxyMaxRetries')} hint={t('settings.deadProxyMaxRetriesHint')}>
                  <Input value={form.deadProxyMaxRetries ?? ''} onChange={(e) => set('deadProxyMaxRetries', e.target.value)} placeholder="3" />
                </F>
              </Grid>
            )}

            <Separator label={t('settings.integrations')} />

            <F label={t('pool.fallbackProxy')} hint={t('pool.fallbackProxyHint')}>
              <SecretField k="scraperProxy" form={form} set={set} placeholder="http://user:pass@ip:port  ou  socks5://ip:port" />
              <a href="https://uhq.monster" target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-primary hover:underline">
                {t('pool.buyFallback')}
              </a>
            </F>

            <Grid>
              <F label={t('settings.groqApiKey')} hint={t('settings.groqApiKeyHint')}>
                <SecretField k="groqApiKey" form={form} set={set} placeholder="gsk_xxxxxxxxxxxxxxxxxxxx" />
              </F>
            </Grid>
          </>
        )}

        {/* ────── SMTP & E-MAILS ────── */}
        {tab === 'smtp' && (
          <>
            <Separator label={t('settings.smtpServer')} />
            <Grid>
              <F label={t('settings.smtpHost')} hint={t('settings.smtpHostHint')}>
                <Input value={form.smtpHost ?? ''} onChange={(e) => set('smtpHost', e.target.value)} placeholder="smtp.gmail.com" />
              </F>
              <F label={t('settings.smtpPort')} hint={t('settings.smtpPortHint')}>
                <Input value={form.smtpPort ?? ''} onChange={(e) => set('smtpPort', e.target.value)} placeholder="587" />
              </F>
              <F label={t('settings.smtpUser')} hint={t('settings.smtpUserHint')}>
                <Input value={form.smtpUser ?? ''} onChange={(e) => set('smtpUser', e.target.value)} placeholder="noreply@example.com" />
              </F>
              <F label={t('settings.smtpPass')} hint={t('settings.smtpPassHint')}>
                <SecretField k="smtpPass" form={form} set={set} placeholder="••••••••••••" />
              </F>
              <F label={t('settings.smtpFrom')} hint={t('settings.smtpFromHint')}>
                <Input value={form.smtpFrom ?? ''} onChange={(e) => set('smtpFrom', e.target.value)} placeholder="UHQ Panel OS <noreply@example.com>" />
              </F>
              <Row>
                <Toggle label={t('settings.smtpSecure')} hint={t('settings.smtpSecureHint')} k="smtpSecure" form={form} set={set} />
              </Row>
            </Grid>

            <Separator label={t('settings.notifications')} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle label={t('settings.emailOnRegister')} hint={t('settings.emailOnRegisterHint')} k="emailOnRegister" form={form} set={set} />
              <Toggle label={t('settings.emailOnLogin')}    hint={t('settings.emailOnLoginHint')}    k="emailOnLogin"    form={form} set={set} />
              <Toggle label={t('settings.emailResetEnabled')} hint={t('settings.emailResetEnabledHint')} k="emailResetEnabled" form={form} set={set} />
            </div>

            <Separator label={t('settings.autoReports')} />
            <Toggle label={t('settings.smtpReportsEnabled')} hint={t('settings.smtpReportsEnabledHint')} k="smtpReportsEnabled" form={form} set={set} />
            {(form.smtpReportsEnabled === true || form.smtpReportsEnabled === 'true') && (
              <Grid className="mt-3 pl-1">
                <F label={t('settings.smtpReportEmail')} hint={t('settings.smtpReportEmailHint')}>
                  <Input value={form.smtpReportEmail ?? ''} onChange={(e) => set('smtpReportEmail', e.target.value)} placeholder="admin@example.com" />
                </F>
                <F label={t('settings.smtpReportFrequency')} hint={t('settings.smtpReportFrequencyHint')}>
                  <select
                    value={form.smtpReportFrequency || 'daily'}
                    onChange={(e) => set('smtpReportFrequency', e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {REPORT_FREQUENCIES.map((f) => (
                      <option key={f.value} value={f.value}>{t(f.labelKey as any)}</option>
                    ))}
                  </select>
                </F>
              </Grid>
            )}

            <Separator label={t('settings.test')} />
            <SmtpTestCard />
          </>
        )}

        {/* ────── CAPTCHA ────── */}
        {tab === 'captcha' && (
          <>
            <F label={t('settings.captchaProvider')} hint={t('settings.captchaHint')}>
              <div className="flex flex-wrap gap-2 mt-1">
                {CAPTCHA_PROVIDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => set('captchaProvider', p)}
                    className={cn(
                      'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                      (form.captchaProvider || 'none') === p
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-input bg-background hover:bg-muted text-foreground',
                    )}
                  >
                    {p === 'none' ? t('settings.captchaProviderNone') : p}
                  </button>
                ))}
              </div>
            </F>

            {form.captchaProvider && form.captchaProvider !== 'none' && (
              <>
                <Separator label={t('settings.keys')} />
                <Grid>
                  <F label={t('settings.captchaSiteKey')} hint={t('settings.captchaSiteKeyHint')}>
                    <Input value={form.captchaSiteKey ?? ''} onChange={(e) => set('captchaSiteKey', e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                  </F>
                  <F label={t('settings.captchaSecretKey')} hint={t('settings.captchaSecretKeyHint')}>
                    <SecretField k="captchaSecretKey" form={form} set={set} placeholder="••••••••••••••••••••••••••" />
                  </F>
                  {form.captchaProvider === 'cap' && (
                    <F label={t('settings.captchaCapEndpoint')} hint={t('settings.captchaCapEndpointHint')} className="sm:col-span-2">
                      <Input value={form.captchaCapEndpoint ?? ''} onChange={(e) => set('captchaCapEndpoint', e.target.value)} placeholder="https://cap.trycap.dev" />
                    </F>
                  )}
                </Grid>
              </>
            )}
          </>
        )}

        {/* ────── WEBHOOKS ────── */}
        {tab === 'webhooks' && (
          <>
            <p className="text-sm text-muted-foreground">
              {t('settings.webhooksDesc')}
            </p>

            <Separator label={t('settings.discordAlerts')} />
            <Toggle
              label={t('settings.enableDiscord')}
              hint={t('settings.enableDiscordHint')}
              k="discordAlertsEnabled" form={form} set={set}
            />
            {(form.discordAlertsEnabled === true || form.discordAlertsEnabled === 'true') && (
              <>
                <F label={t('settings.discordWebhook')} hint={t('settings.discordWebhookHint')}>
                  <SecretField k="discordWebhookUrl" form={form} set={set} placeholder="https://discord.com/api/webhooks/..." />
                </F>
                <WebhookTestButton target="discord" />
              </>
            )}

            <Separator label={t('settings.slackAlerts')} />
            <Toggle
              label={t('settings.enableSlack')}
              hint={t('settings.enableSlackHint')}
              k="slackAlertsEnabled" form={form} set={set}
            />
            {(form.slackAlertsEnabled === true || form.slackAlertsEnabled === 'true') && (
              <>
                <F label={t('settings.slackWebhook')} hint={t('settings.slackWebhookHint')}>
                  <SecretField k="slackWebhookUrl" form={form} set={set} placeholder="https://hooks.slack.com/services/..." />
                </F>
                <WebhookTestButton target="slack" />
              </>
            )}

            <Separator label={t('settings.bloumechatAlerts')} />
            <Toggle
              label={t('settings.enableBloumechat')}
              hint={t('settings.enableBloumechatHint')}
              k="bloumechatAlertsEnabled" form={form} set={set}
            />
            {(form.bloumechatAlertsEnabled === true || form.bloumechatAlertsEnabled === 'true') && (
              <>
                <F label={t('settings.bloumechatWebhook')} hint={t('settings.bloumechatWebhookHint')}>
                  <SecretField k="bloumechatWebhookUrl" form={form} set={set} placeholder="https://bloumechat.com/api/v2/webhooks/.../..." />
                </F>
                <WebhookTestButton target="bloumechat" />
              </>
            )}
          </>
        )}

        {/* ────── BACKUPS ────── */}
        {tab === 'backups' && (
          <>
            {/* Import / Export Settings */}
            <div className="rounded-xl border bg-muted/10 p-5 space-y-4">
              <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                {t('settings.configParams')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t('settings.configParamsHint')}
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={handleExportSettings} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  {t('settings.backupSettingsExport')}
                </Button>
                <label className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent/80 transition-colors cursor-pointer">
                  <Upload className="h-3.5 w-3.5" />
                  <span>{t('settings.backupSettingsImport')}</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportSettings}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Database Backups Scheduler */}
            <div className="rounded-xl border bg-muted/10 p-5 space-y-4">
              <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                {t('settings.backups')}
              </h3>
              
              <Toggle
                label={t('settings.backupEnabled')}
                hint={t('settings.backupEnabledHint')}
                k="backupDatabaseEnabled" form={form} set={set}
              />

              {(form.backupDatabaseEnabled === true || form.backupDatabaseEnabled === 'true') && (
                <Grid className="pt-2">
                  <F label={t('settings.backupCron')} hint={t('settings.backupCronHint')}>
                    <Input
                      value={form.backupIntervalCron ?? ''}
                      onChange={(e) => set('backupIntervalCron', e.target.value)}
                      placeholder="0 0 * * *"
                    />
                  </F>

                  <F label={t('settings.backupStorage')} hint={t('settings.backupStorageHint')}>
                    <select
                      value={form.backupStorageType || 'local'}
                      onChange={(e) => set('backupStorageType', e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="local">{t('settings.backupStorageLocal')}</option>
                      <option value="s3">{t('settings.backupStorageS3')}</option>
                    </select>
                  </F>
                </Grid>
              )}

              {/* Local config options */}
              {(form.backupDatabaseEnabled === true || form.backupDatabaseEnabled === 'true') && (form.backupStorageType || 'local') === 'local' && (
                <F label={t('settings.backupLocalPath')} hint={t('settings.backupLocalPathHint')}>
                  <Input
                    value={form.backupLocalPath ?? ''}
                    onChange={(e) => set('backupLocalPath', e.target.value)}
                    placeholder="./data/backups"
                  />
                </F>
              )}

              {/* S3 config options */}
              {(form.backupDatabaseEnabled === true || form.backupDatabaseEnabled === 'true') && (form.backupStorageType || 'local') === 's3' && (
                <div className="border-t pt-4 space-y-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase">{t('settings.s3Config')}</h4>
                  <Grid>
                    <F label={t('settings.backupS3Endpoint')} hint={t('settings.backupS3EndpointHint')}>
                      <Input
                        value={form.backupS3Endpoint ?? ''}
                        onChange={(e) => set('backupS3Endpoint', e.target.value)}
                        placeholder="https://s3.eu-west-3.amazonaws.com"
                      />
                    </F>
                    <F label={t('settings.backupS3Region')} hint={t('settings.backupS3RegionHint')}>
                      <Input
                        value={form.backupS3Region ?? ''}
                        onChange={(e) => set('backupS3Region', e.target.value)}
                        placeholder="us-east-1"
                      />
                    </F>
                    <F label={t('settings.backupS3Bucket')} hint={t('settings.backupS3BucketHint')}>
                      <Input
                        value={form.backupS3Bucket ?? ''}
                        onChange={(e) => set('backupS3Bucket', e.target.value)}
                        placeholder="my-uhq-backups"
                      />
                    </F>
                    <F label={t('settings.backupS3AccessKey')} hint={t('settings.backupS3AccessKeyHint')}>
                      <Input
                        value={form.backupS3AccessKey ?? ''}
                        onChange={(e) => set('backupS3AccessKey', e.target.value)}
                        placeholder="AKIAIOSFODNN7EXAMPLE"
                      />
                    </F>
                    <F label={t('settings.backupS3SecretKey')} hint={t('settings.backupS3SecretKeyHint')}>
                      <SecretField k="backupS3SecretKey" form={form} set={set} placeholder="••••••••••••••••" />
                    </F>
                  </Grid>
                </div>
              )}
            </div>

            {/* Manual Run actions and Backups list */}
            <div className="rounded-xl border bg-muted/10 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                  {t('settings.backupListTitle')}
                </h3>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleRunBackup}
                  disabled={backupBusy}
                  className="gap-1.5"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', backupBusy && 'animate-spin')} />
                  {t('settings.backupNow')}
                </Button>
              </div>

              {/* List table */}
              <div className="overflow-hidden rounded-lg border bg-card">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 font-medium text-muted-foreground">
                      <th className="p-3">{t('settings.backupFile')}</th>
                      <th className="p-3">{t('settings.backupSize')}</th>
                      <th className="p-3">{t('settings.backupLocation')}</th>
                      <th className="p-3">{t('settings.backupDate')}</th>
                      <th className="p-3 text-right">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!backupsList || backupsList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-muted-foreground">
                          {t('settings.backupNone')}
                        </td>
                      </tr>
                    ) : (
                      backupsList.map((b: any) => (
                        <tr key={b.filename} className="border-b hover:bg-muted/10 transition-colors">
                          <td className="p-3 font-mono text-[11px] truncate max-w-[200px]" title={b.filename}>
                            {b.filename}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {formatSize(b.size)}
                          </td>
                          <td className="p-3">
                            <span className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase',
                              b.storage === 's3' ? 'bg-blue-500/10 text-blue-500' : 'bg-green-500/10 text-green-500'
                            )}>
                              {b.storage}
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {new Date(b.updatedAt).toLocaleString()}
                          </td>
                          <td className="p-3 text-right space-x-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={backupBusy}
                              onClick={() => handleRestoreBackup(b.filename)}
                            >
                              {t('settings.backupRestore')}
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteBackup(b.filename)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ────── CLÉ API ────── */}
        {tab === 'apikey' && (
          <>
            <p className="text-sm text-muted-foreground">
              Utilisée pour l'API legacy <code className="text-xs bg-muted px-1 py-0.5 rounded">/api/v1</code> via
              l'en-tête <code className="text-xs bg-muted px-1 py-0.5 rounded">X-API-Key</code> ou en mot de passe Basic auth.
            </p>
            <ApiKeyCard />
          </>
        )}

      </div>

      {/* ── Save bottom ── */}
      <div className="flex justify-end pt-8">
        <Button type="submit">{t('common.save')}</Button>
      </div>

    </form>
  );
}

// ── Layout helpers ───────────────────────────────────────────────────────────

function Grid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>;
}

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-3', className)}>{children}</div>;
}

function Separator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{label}</span>
      <hr className="flex-1 border-border" />
    </div>
  );
}

// ── Field helpers ─────────────────────────────────────────────────────────────

function F({
  label, hint, className, children,
}: {
  label: string; hint?: string; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground leading-snug">{hint}</p>}
    </div>
  );
}

function Toggle({
  label, hint, k, form, set,
}: {
  label: string; hint?: string; k: string;
  form: Record<string, any>; set: (k: string, v: any) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3 gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{hint}</p>}
      </div>
      <Switch
        checked={form[k] === true || form[k] === 'true'}
        onCheckedChange={(v) => set(k, v)}
      />
    </div>
  );
}

// ── SMTP test ────────────────────────────────────────────────────────────────

function SmtpTestCard() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const test = async () => {
    if (!email) return;
    setBusy(true); setMsg('');
    try {
      const { data } = await api.post('/settings/smtp/test', { email });
      setMsg(data.status === 'success' ? t('settings.smtpTestSent') : t('settings.smtpTestFailed'));
    } catch { setMsg(t('settings.smtpTestFailed')); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <F label={t('settings.smtpTest')} className="flex-1 min-w-[200px]">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('settings.smtpTestEmailPlaceholder')} />
      </F>
      <Button type="button" variant="outline" size="sm" className="mb-[1px]" onClick={test} disabled={busy || !email}>
        <Send className="h-3.5 w-3.5 mr-1.5" />{t('settings.smtpTest')}
      </Button>
      {msg && <p className="w-full text-xs text-primary">{msg}</p>}
    </div>
  );
}

// ── Webhook test ───────────────────────────────────────────────────────────────

function WebhookTestButton({ target }: { target: 'discord' | 'slack' | 'bloumechat' }) {
  const t = useT();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const test = async () => {
    setBusy(true); setMsg('');
    try {
      const { data } = await api.post('/settings/webhook/test', { target });
      setMsg(data.status === 'success' ? t('settings.webhookTestSent') : (data.message || t('settings.webhookTestFailed')));
    } catch { setMsg(t('settings.webhookTestFailed')); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" size="sm" onClick={test} disabled={busy}>
        <Send className="h-3.5 w-3.5 mr-1.5" />{t('settings.testWebhook')}
      </Button>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

// ── Secret field (masqué, révélable par confirmation du mot de passe) ───────

function SecretField({
  k, form, set, placeholder,
}: {
  k: string; form: Record<string, any>; set: (k: string, v: any) => void; placeholder?: string;
}) {
  const t = useT();
  const [revealed, setRevealed] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const value = form[k] ?? '';
  const isMasked = /^•+$/.test(value);

  const toggle = () => {
    if (revealed) { setRevealed(false); return; }
    if (isMasked) { setErr(''); setPwd(''); setPrompting(true); return; }
    setRevealed(true);
  };

  const confirmReveal = async () => {
    if (!pwd || busy) return;
    setBusy(true); setErr('');
    try {
      const { data } = await api.post('/settings/reveal', { key: k, password: pwd });
      set(k, data.value ?? '');
      setRevealed(true);
      setPrompting(false);
      setPwd('');
    } catch (e) {
      setErr(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="relative">
        <Input
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(e) => { set(k, e.target.value); setRevealed(true); }}
          placeholder={placeholder}
          className="pr-9"
        />
        <button
          type="button"
          onClick={toggle}
          tabIndex={-1}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
      {prompting && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-2">
          <Input
            type="password"
            autoFocus
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder={t('settings.confirmPasswordPlaceholder')}
            className="h-8 max-w-[220px] text-xs"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmReveal(); } }}
          />
          <Button type="button" size="sm" disabled={busy || !pwd} onClick={confirmReveal}>
            {t('common.confirm')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => { setPrompting(false); setPwd(''); setErr(''); }}>
            {t('common.cancel')}
          </Button>
          {err && <p className="w-full text-xs text-destructive">{err}</p>}
        </div>
      )}
    </div>
  );
}

// ── API key ──────────────────────────────────────────────────────────────────

function ApiKeyCard() {
  const t = useT();
  const [key, setKey]   = useState('');
  const [shown, setShown] = useState(false);
  const [busy, setBusy]   = useState(false);

  const reveal = async () => {
    if (!key) { const { data } = await api.get('/settings/api-key'); setKey(data.apiKey); }
    setShown((s) => !s);
  };
  const regenerate = async () => {
    if (!confirm('Régénérer la clé ? L\'ancienne sera invalidée.')) return;
    setBusy(true);
    try { const { data } = await api.post('/settings/api-key/regenerate'); setKey(data.apiKey); setShown(true); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <Input readOnly value={shown ? key : key ? '••••••••••••••••' : t('settings.clickReveal')} className="max-w-sm font-mono text-xs" />
      <Button type="button" variant="outline" size="sm" onClick={reveal}>
        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        <span className="ml-1.5">{shown ? t('common.hide') : t('common.show')}</span>
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={!key} onClick={() => navigator.clipboard.writeText(key)}>
        <Copy className="h-3.5 w-3.5" /><span className="ml-1.5">{t('common.copy')}</span>
      </Button>
      <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={regenerate}>
        <RefreshCw className="h-3.5 w-3.5" /><span className="ml-1.5">{t('common.regenerate')}</span>
      </Button>
    </div>
  );
}
