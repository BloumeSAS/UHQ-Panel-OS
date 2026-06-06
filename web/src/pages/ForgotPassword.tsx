import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSite } from '@/lib/site';
import { useT } from '@/lib/i18n';
import { api, apiError } from '@/lib/api';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui';
import { Footer } from '@/components/Footer';
import { CaptchaWidget } from '@/components/CaptchaWidget';

export default function ForgotPassword() {
  const { status } = useSite();
  const t = useT();
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const captchaProvider = (status?.captchaProvider || 'none') as any;
  const captchaSiteKey = status?.captchaSiteKey || '';
  const captchaCapEndpoint = status?.captchaCapEndpoint || '';
  const needCaptcha = captchaProvider !== 'none' && !!captchaSiteKey;

  if (status && !status.resetPasswordEnabled) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center text-center">
            <img src={status?.logoUrl || '/static/logo.png'} alt="logo" className="mb-2 h-12 w-12 rounded" />
            <CardTitle className="text-2xl">{status?.siteName || 'UHQ Panel OS'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">{t('forgotPassword.disabled')}</p>
            <Link to="/login" className="text-sm text-primary hover:underline">
              {t('forgotPassword.backToLogin')}
            </Link>
          </CardContent>
        </Card>
        <Footer className="absolute inset-x-0 bottom-0" />
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', {
        email,
        captchaToken: needCaptcha ? captchaToken : undefined,
      });
      setSent(true);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <img src={status?.logoUrl || '/static/logo.png'} alt="logo" className="mb-2 h-12 w-12 rounded" />
          <CardTitle className="text-2xl">{status?.siteName || 'UHQ Panel OS'}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('forgotPassword.title')}</p>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-primary">{t('forgotPassword.sent')}</p>
              <Link to="/login" className="text-sm text-primary hover:underline">
                {t('forgotPassword.backToLogin')}
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <p className="text-sm text-muted-foreground">{t('forgotPassword.subtitle')}</p>
              <div className="space-y-1.5">
                <Label>{t('auth.email')}</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.emailPlaceholder')} required />
              </div>

              {needCaptcha && (
                <CaptchaWidget
                  provider={captchaProvider}
                  siteKey={captchaSiteKey}
                  capEndpoint={captchaCapEndpoint}
                  onVerify={setCaptchaToken}
                  onExpire={() => setCaptchaToken('')}
                />
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={busy || (needCaptcha && !captchaToken)}>
                {t('forgotPassword.submit')}
              </Button>

              <p className="text-center text-sm">
                <Link to="/login" className="text-primary hover:underline">
                  {t('forgotPassword.backToLogin')}
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
      <Footer className="absolute inset-x-0 bottom-0" />
    </div>
  );
}
