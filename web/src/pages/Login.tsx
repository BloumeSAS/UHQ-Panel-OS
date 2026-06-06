import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useSite } from '@/lib/site';
import { useT } from '@/lib/i18n';
import { apiError } from '@/lib/api';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui';
import { Footer } from '@/components/Footer';
import { CaptchaWidget } from '@/components/CaptchaWidget';

export default function Login() {
  const { login } = useAuth();
  const { status } = useSite();
  const t = useT();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const captchaProvider = (status?.captchaProvider || 'none') as any;
  const captchaSiteKey = status?.captchaSiteKey || '';
  const captchaCapEndpoint = status?.captchaCapEndpoint || '';
  const needCaptcha = captchaProvider !== 'none' && !!captchaSiteKey;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password, needCaptcha ? captchaToken : undefined);
      navigate('/');
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
          <p className="text-sm text-muted-foreground">{t('login.title')}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('auth.email')}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.emailPlaceholder')} required />
            </div>
            <div className="space-y-1.5">
              <Label>{t('auth.password')}</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('auth.passwordPlaceholder')} required />
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
              {t('login.submit')}
            </Button>
          </form>

          <div className="mt-4 flex flex-col gap-2 text-center text-sm text-muted-foreground">
            {status?.resetPasswordEnabled && (
              <Link to="/forgot-password" className="text-primary hover:underline">
                {t('login.forgotPassword')}
              </Link>
            )}
            {status?.registrationEnabled && (
              <p>
                {t('login.noAccount')}{' '}
                <Link to="/register" className="text-primary hover:underline">
                  {t('login.register')}
                </Link>
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      <Footer className="absolute inset-x-0 bottom-0" />
    </div>
  );
}
