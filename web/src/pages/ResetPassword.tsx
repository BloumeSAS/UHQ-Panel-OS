import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSite } from '@/lib/site';
import { useT } from '@/lib/i18n';
import { api, apiError } from '@/lib/api';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui';
import { Footer } from '@/components/Footer';
import { CaptchaWidget } from '@/components/CaptchaWidget';

export default function ResetPassword() {
  const { status } = useSite();
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const captchaProvider = (status?.captchaProvider || 'none') as any;
  const captchaSiteKey = status?.captchaSiteKey || '';
  const captchaCapEndpoint = status?.captchaCapEndpoint || '';
  const needCaptcha = captchaProvider !== 'none' && !!captchaSiteKey;

  if (!token) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="py-8 text-center space-y-4">
            <p className="text-sm text-destructive">{t('resetPassword.invalidToken')}</p>
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
      await api.post('/auth/reset-password', {
        token,
        password,
        captchaToken: needCaptcha ? captchaToken : undefined,
      });
      navigate('/login', { state: { resetSuccess: true } });
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
          <p className="text-sm text-muted-foreground">{t('resetPassword.title')}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('auth.newPassword')}</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.newPasswordPlaceholder')}
                required
                minLength={8}
              />
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
              {t('resetPassword.submit')}
            </Button>

            <p className="text-center text-sm">
              <Link to="/login" className="text-primary hover:underline">
                {t('forgotPassword.backToLogin')}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
      <Footer className="absolute inset-x-0 bottom-0" />
    </div>
  );
}
