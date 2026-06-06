import { useState, useEffect } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useSite } from '@/lib/site';
import { useT } from '@/lib/i18n';
import { api, apiError } from '@/lib/api';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui';
import { Footer } from '@/components/Footer';
import { CaptchaWidget } from '@/components/CaptchaWidget';

export default function Register() {
  const { register, applyToken } = useAuth();
  const { status } = useSite();
  const t = useT();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const inviteToken = searchParams.get('invite');
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(!!inviteToken);
  const [inviteError, setInviteError] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (inviteToken) {
      api.get(`/invitations/check?token=${inviteToken}`)
        .then(({ data }) => {
          setInviteEmail(data.email);
          setEmail(data.email);
        })
        .catch((err) => {
          setInviteError(apiError(err) || 'Invitation invalide ou expirée');
        })
        .finally(() => {
          setInviteLoading(false);
        });
    }
  }, [inviteToken]);

  if (status && !status.registrationEnabled && !inviteToken) {
    return <Navigate to="/login" replace />;
  }

  const captchaProvider = (status?.captchaProvider || 'none') as any;
  const captchaSiteKey = status?.captchaSiteKey || '';
  const captchaCapEndpoint = status?.captchaCapEndpoint || '';
  const needCaptcha = captchaProvider !== 'none' && !!captchaSiteKey && !inviteToken;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (inviteToken) {
        const { data } = await api.post('/invitations/accept', { token: inviteToken, password });
        applyToken(data.token, data.user);
      } else {
        await register(email, password, needCaptcha ? captchaToken : undefined);
      }
      navigate('/');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  if (inviteLoading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('app.loading')}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (inviteError) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center text-center">
            <CardTitle className="text-destructive text-xl">Erreur d'invitation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-center text-muted-foreground">{inviteError}</p>
            <Button className="w-full" onClick={() => navigate('/login')}>
              {t('forgotPassword.backToLogin')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <img src={status?.logoUrl || '/static/logo.png'} alt="logo" className="mb-2 h-12 w-12 rounded" />
          <CardTitle className="text-2xl">{t('register.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('auth.email')}</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                required
                disabled={!!inviteEmail}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('auth.password')}</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('auth.passwordPlaceholder')} required minLength={8} />
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
              {t('register.submit')}
            </Button>
          </form>
          {!inviteToken && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {t('register.haveAccount')}{' '}
              <Link to="/login" className="text-primary hover:underline">
                {t('login.title')}
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
      <Footer className="absolute inset-x-0 bottom-0" />
    </div>
  );
}
