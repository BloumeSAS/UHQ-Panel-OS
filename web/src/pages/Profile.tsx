import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { UserCircle, Mail, ShieldCheck, KeyRound, ShieldAlert, ArrowRight } from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { Button, Card, Input, Label } from '@/components/ui';
import { toast } from '@/lib/toast';

export default function ProfilePage() {
  const t = useT();
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const { data: totpStatus } = useQuery({
    queryKey: ['totp-status'],
    queryFn: async () => {
      const { data } = await api.get('/security/totp/status');
      return data as { totpEnabled: boolean };
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: () => api.patch('/security/password', { currentPassword, newPassword }),
    onSuccess: () => {
      toast.success(t('profile.passwordChanged'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const passwordsMismatch = newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit = currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCircle className="h-6 w-6 text-primary" />
          {t('profile.title')}
        </h1>
        <p className="text-muted-foreground mt-1">{t('profile.subtitle')}</p>
      </div>

      {/* Compte */}
      <Card className="p-6 space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Mail className="h-5 w-5" />
          {t('profile.account')}
        </h2>
        <div className="flex items-center justify-between py-1 border-b border-dashed">
          <span className="text-muted-foreground text-sm">{t('profile.email')}</span>
          <span className="font-mono text-sm">{user?.email}</span>
        </div>
        <div className="flex items-center justify-between py-1">
          <span className="text-muted-foreground text-sm">{t('profile.role')}</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">{user?.role}</span>
        </div>
      </Card>

      {/* Mot de passe */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          {t('profile.changePassword')}
        </h2>
        <form
          className="space-y-3 max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) changePasswordMutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>{t('profile.currentPassword')}</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>{t('profile.newPassword')}</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required />
          </div>
          <div className="space-y-1.5">
            <Label>{t('profile.confirmPassword')}</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            {passwordsMismatch && <p className="text-xs text-destructive">{t('profile.passwordMismatch')}</p>}
          </div>
          <Button type="submit" disabled={!canSubmit || changePasswordMutation.isPending}>
            {t('profile.updatePassword')}
          </Button>
        </form>
      </Card>

      {/* Raccourcis sécurité */}
      <Card className="p-6 space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          {t('profile.security')}
        </h2>
        <Link
          to="/security"
          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{t('security.totp')}</p>
              <p className="text-xs text-muted-foreground">{t('profile.totpHint')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${totpStatus?.totpEnabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}
            >
              {totpStatus?.totpEnabled ? t('security.totpActive') : t('security.totpInactive')}
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </Link>
      </Card>
    </div>
  );
}
