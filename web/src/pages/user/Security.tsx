import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import {
  ShieldCheck, Smartphone, Monitor, Trash2, CheckCircle2, XCircle, QrCode, Copy, Check,
  AlertTriangle, KeyRound, Download,
} from 'lucide-react';
import { Button, Input, Card } from '@/components/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/dialog';
import { toast } from '@/lib/toast';

export default function SecurityPage() {
  const t = useT();
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [totpCode, setTotpCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [regenCode, setRegenCode] = useState('');
  const [showRegenPrompt, setShowRegenPrompt] = useState(false);
  const [qrData, setQrData] = useState<{ qrCode: string; secret: string; otpauth: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  // TOTP status
  const { data: totpStatus, refetch: refetchTotp } = useQuery({
    queryKey: ['totp-status'],
    queryFn: async () => {
      const { data } = await api.get('/security/totp/status');
      return data as { totpEnabled: boolean; recoveryCodesRemaining: number };
    },
  });

  // Sessions
  const { data: sessions, refetch: refetchSessions } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const { data } = await api.get('/security/sessions');
      return data.data as any[];
    },
  });

  const setupTotpMutation = useMutation({
    mutationFn: () => api.post('/security/totp/setup'),
    onSuccess: ({ data }) => {
      setQrData({ qrCode: data.qrCode, secret: data.secret, otpauth: data.otpauth });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const enableTotpMutation = useMutation({
    mutationFn: (token: string) => api.post('/security/totp/enable', { token }),
    onSuccess: async ({ data }) => {
      toast.success(t('security.totpEnabled'));
      setQrData(null);
      setTotpCode('');
      setRecoveryCodes(data.recoveryCodes);
      refetchTotp();
      await refreshUser();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const disableTotpMutation = useMutation({
    mutationFn: (token: string) => api.post('/security/totp/disable', { token }),
    onSuccess: async () => {
      toast.success(t('security.totpDisabled'));
      setDisableCode('');
      refetchTotp();
      await refreshUser();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const regenerateCodesMutation = useMutation({
    mutationFn: (token: string) => api.post('/security/totp/recovery-codes/regenerate', { token }),
    onSuccess: ({ data }) => {
      setRecoveryCodes(data.recoveryCodes);
      setShowRegenPrompt(false);
      setRegenCode('');
      refetchTotp();
      toast.success(t('security.recoveryCodesRegenerated'));
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const revokeSessionMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/security/sessions/${id}`),
    onSuccess: () => {
      toast.success(t('security.sessionRevoked'));
      refetchSessions();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const revokeAllMutation = useMutation({
    mutationFn: () => api.delete('/security/sessions'),
    onSuccess: () => {
      toast.success(t('security.allSessionsRevoked'));
      refetchSessions();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const copySecret = () => {
    if (qrData?.secret) {
      navigator.clipboard.writeText(qrData.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyRecoveryCodes = () => {
    if (recoveryCodes) navigator.clipboard.writeText(recoveryCodes.join('\n'));
  };

  const downloadRecoveryCodes = () => {
    if (!recoveryCodes) return;
    const blob = new Blob([recoveryCodes.join('\n') + '\n'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'uhq-panel-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const totpEnabled = totpStatus?.totpEnabled ?? false;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          {t('security.title')}
        </h1>
        <p className="text-muted-foreground mt-1">{t('security.subtitle')}</p>
      </div>

      {user?.mustSetup2fa && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive">{t('security.mustSetupTitle')}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{t('security.mustSetupHint')}</p>
          </div>
        </div>
      )}

      {/* 2FA / TOTP */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              {t('security.totp')}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">{t('security.totpDesc')}</p>
          </div>
          <div className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full ${totpEnabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
            {totpEnabled ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {totpEnabled ? t('security.totpActive') : t('security.totpInactive')}
          </div>
        </div>

        {!totpEnabled && !qrData && (
          <Button onClick={() => setupTotpMutation.mutate()} disabled={setupTotpMutation.isPending}>
            <QrCode className="h-4 w-4 mr-2" />
            {t('security.totpSetup')}
          </Button>
        )}

        {qrData && (
          <div className="space-y-4 p-4 rounded-lg border bg-muted/40">
            <p className="text-sm">{t('security.totpScanHint')}</p>
            <div className="flex flex-col sm:flex-row gap-6 items-center">
              <img src={qrData.qrCode} alt="QR Code 2FA" className="w-40 h-40 rounded-lg border p-1 bg-white" />
              <div className="space-y-3 flex-1">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t('security.totpSecretLabel')}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-background border rounded px-2 py-1.5 font-mono break-all">{qrData.secret}</code>
                    <Button variant="ghost" size="icon" onClick={copySecret}>
                      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('security.totpVerifyHint')}</p>
                  <div className="flex gap-2">
                    <Input
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      placeholder={t('security.totpCodePlaceholder')}
                      maxLength={6}
                      className="max-w-[140px] font-mono text-center text-lg tracking-widest"
                    />
                    <Button
                      onClick={() => enableTotpMutation.mutate(totpCode)}
                      disabled={totpCode.length < 6 || enableTotpMutation.isPending}
                    >
                      {t('security.totpActivate')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {totpEnabled && (
          <>
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2 text-sm">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <span>{t('security.recoveryCodesRemaining').replace('{n}', String(totpStatus?.recoveryCodesRemaining ?? 0))}</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowRegenPrompt(true)}>
                {t('security.recoveryCodesRegenerate')}
              </Button>
            </div>

            <div className="space-y-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
              <p className="text-sm text-muted-foreground">{t('security.totpDisableHint')}</p>
              <div className="flex gap-2">
                <Input
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  placeholder={t('security.totpCodePlaceholder')}
                  maxLength={6}
                  className="max-w-[140px] font-mono text-center text-lg tracking-widest"
                />
                <Button
                  variant="destructive"
                  onClick={() => disableTotpMutation.mutate(disableCode)}
                  disabled={disableCode.length < 6 || disableTotpMutation.isPending}
                >
                  {t('security.totpDisable')}
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Active Sessions */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              {t('security.sessions')}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">{t('security.sessionsDesc')}</p>
          </div>
          {(sessions?.length ?? 0) > 1 && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive hover:bg-destructive/10"
              onClick={() => revokeAllMutation.mutate()}
              disabled={revokeAllMutation.isPending}
            >
              {t('security.revokeAll')}
            </Button>
          )}
        </div>

        <div className="space-y-2">
          {!sessions?.length && (
            <p className="text-sm text-muted-foreground text-center py-4">{t('security.noSessions')}</p>
          )}
          {sessions?.map((s: any) => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
              <Monitor className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{s.userAgent || t('security.unknownDevice')}</p>
                <p className="text-xs text-muted-foreground">
                  IP: {s.ip || '—'} · {t('security.lastSeen')}: {new Date(s.lastSeen).toLocaleString()}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => revokeSessionMutation.mutate(s.id)}
                disabled={revokeSessionMutation.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Prompt régénération : demande le code TOTP actuel avant d'invalider les anciens codes */}
      <Dialog open={showRegenPrompt} onOpenChange={setShowRegenPrompt}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('security.recoveryCodesRegenerate')}</DialogTitle>
            <DialogDescription>{t('security.recoveryCodesRegenerateHint')}</DialogDescription>
          </DialogHeader>
          <Input
            value={regenCode}
            onChange={(e) => setRegenCode(e.target.value)}
            placeholder={t('security.totpCodePlaceholder')}
            maxLength={6}
            className="font-mono text-center text-lg tracking-widest"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenPrompt(false)}>{t('common.cancel')}</Button>
            <Button
              onClick={() => regenerateCodesMutation.mutate(regenCode)}
              disabled={regenCode.length < 6 || regenerateCodesMutation.isPending}
            >
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Codes de récupération — affichés une seule fois (à l'activation ou après régénération) */}
      <Dialog open={!!recoveryCodes} onOpenChange={(o) => !o && setRecoveryCodes(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              {t('security.recoveryCodesTitle')}
            </DialogTitle>
            <DialogDescription>{t('security.recoveryCodesHint')}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-4 font-mono text-sm">
            {recoveryCodes?.map((c) => (
              <span key={c} className="tracking-wider">{c}</span>
            ))}
          </div>
          <DialogFooter className="sm:justify-between">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyRecoveryCodes}>
                <Copy className="h-3.5 w-3.5 mr-1.5" /> {t('common.copy')}
              </Button>
              <Button variant="outline" size="sm" onClick={downloadRecoveryCodes}>
                <Download className="h-3.5 w-3.5 mr-1.5" /> {t('common.download')}
              </Button>
            </div>
            <Button onClick={() => setRecoveryCodes(null)}>{t('security.recoveryCodesSaved')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
