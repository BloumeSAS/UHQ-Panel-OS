import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Minus, Plus } from 'lucide-react';
import { addonApi } from '@/lib/addonApi';
import { apiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { Button, Input, Label } from '@/components/ui';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/dialog';

export interface PoolProxyRef {
  id: string;
  ip: string;
  port: number;
  url?: string;
  pool?: string | null;
}

interface Match {
  id: string;
  label: string | null;
  productName: string | null;
  status: string;
  totalGb: number;
  usedGb: number;
  priceUnit: 'GB' | 'MB';
  minAmount: number | null;
  maxAmount: number | null;
  capabilities: { resetPassword?: boolean; removeBandwidth?: boolean; refundPolicy?: string };
}

const BASE = '/reseller/api/reseller';

/** Identifiant (nom d'utilisateur) d'une ligne du pool : lu dans son URL `proto://user:pass@hôte:port`. */
function usernameOf(url?: string): string {
  try {
    return url ? decodeURIComponent(new URL(url).username) : '';
  } catch {
    return '';
  }
}

/**
 * Petite fenêtre « UHQ.Monster » d'une ligne du pool : ajouter / reprendre des Go, réinitialiser le mot de passe.
 * Le proxy est retrouvé chez UHQ.Monster par hôte + port + identifiant (via l'addon Reseller). Un proxy qui n'a pas été
 * acheté avec votre compte revendeur est signalé comme tel et rien n'est modifié.
 */
export function ResellerProxyDialog({ proxy, onClose, onChanged }: { proxy: PoolProxyRef; onClose: () => void; onChanged: () => void }) {
  const t = useT();
  const [match, setMatch] = useState<Match | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<'idle' | 'remove' | 'reset'>('idle');
  const [busy, setBusy] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try {
      const { data } = await addonApi.get(`${BASE}/lookup`, { params: { host: proxy.ip, port: proxy.port, username: usernameOf(proxy.url) } });
      setMatch(data);
      setAmount((a) => a || String(data.minAmount ?? 1));
      setState('ready');
    } catch (e: any) {
      if (e?.response?.status === 404) setState('notfound');
      else {
        setError(apiError(e));
        setState('error');
      }
    }
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      toast.success(await fn());
      setStep('idle');
      onChanged();
      await load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const unit = match?.priceUnit === 'MB' ? 'Mo' : 'Go';
  const amountNum = Number(amount);
  const outOfLimits = !!match && match.minAmount !== null && (amountNum < match.minAmount || (match.maxAmount !== null && amountNum > match.maxAmount));
  const pct = match && match.totalGb > 0 ? Math.min(100, (match.usedGb / match.totalGb) * 100) : 0;
  const policy = match?.capabilities?.refundPolicy;

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t('resPool.title')} <span className="font-mono text-xs font-normal text-muted-foreground">{proxy.ip}:{proxy.port}</span>
          </DialogTitle>
        </DialogHeader>

        {state === 'loading' && <p className="text-sm text-muted-foreground">{t('app.loading')}</p>}
        {state === 'notfound' && <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">{t('resPool.notFound')}</p>}
        {state === 'error' && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

        {state === 'ready' && match && (
          <div className="space-y-4">
            <div className="space-y-1.5 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">{match.label ?? '—'}</span>
                <span className="text-xs text-muted-foreground">{match.productName ?? ''}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
              <p className="text-xs text-muted-foreground">
                {match.usedGb.toLocaleString(undefined, { maximumFractionDigits: 2 })} / {match.totalGb > 0 ? match.totalGb.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '∞'} {unit}
              </p>
            </div>

            {newPassword && (
              <div className="space-y-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
                <p className="text-sm font-medium">{t('resPool.newPassword')}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs">{newPassword}</code>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => navigator.clipboard?.writeText(newPassword).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t('resPool.newPasswordHint')}</p>
              </div>
            )}

            {step === 'idle' && (
              <>
                <div className="space-y-1.5">
                  <Label>{t('resPool.amount').replace('{unit}', unit)}</Label>
                  <div className="flex gap-2">
                    <Input type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9" />
                    <Button
                      type="button"
                      className="h-9 gap-1.5"
                      disabled={busy || !(amountNum > 0) || outOfLimits}
                      onClick={() => run(async () => (await addonApi.post(`${BASE}/proxies/${match.id}/balance`, { action: 'add', amountGb: amountNum })).data.message || t('resPool.added'))}
                    >
                      <Plus className="h-3.5 w-3.5" /> {t('resPool.add')}
                    </Button>
                  </div>
                  {match.minAmount !== null && (
                    <p className="text-xs text-muted-foreground">
                      {t('resPool.limits').replace('{min}', String(match.minAmount)).replace('{max}', match.maxAmount === null ? '∞' : String(match.maxAmount)).replace('{unit}', unit)}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="gap-1.5" disabled={busy || match.capabilities.removeBandwidth === false} onClick={() => setStep('remove')}>
                    <Minus className="h-3.5 w-3.5" /> {t('resPool.remove')}
                  </Button>
                  <Button type="button" variant="outline" className="gap-1.5" disabled={busy || match.capabilities.resetPassword === false} onClick={() => setStep('reset')}>
                    <KeyRound className="h-3.5 w-3.5" /> {t('resPool.reset')}
                  </Button>
                </div>
              </>
            )}

            {step === 'remove' && (
              <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <p className="text-sm">{t('resPool.removeBody')}</p>
                <p className="text-xs text-muted-foreground">
                  {policy === 'full' ? t('resPool.refundFull') : policy === 'min_1gb' ? t('resPool.refundMin1') : policy === 'none' ? t('resPool.refundNone') : t('resPool.refundUnknown')}
                </p>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" disabled={busy} onClick={() => setStep('idle')}>{t('common.cancel')}</Button>
                  <Button type="button" variant="destructive" disabled={busy} onClick={() => run(async () => (await addonApi.post(`${BASE}/proxies/${match.id}/balance`, { action: 'remove' })).data.message || t('resPool.removed'))}>
                    {t('resPool.removeConfirm')}
                  </Button>
                </div>
              </div>
            )}

            {step === 'reset' && (
              <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <p className="text-sm">{t('resPool.resetBody')}</p>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" disabled={busy} onClick={() => setStep('idle')}>{t('common.cancel')}</Button>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const { data } = await addonApi.post(`${BASE}/proxies/${match.id}/password`, { panelProxyId: proxy.id, category: proxy.pool ?? null });
                        setNewPassword(data.password);
                        if (data.imported) toast.success(t('resPool.resetDone'));
                        else toast.error(t('resPool.resetPartial').replace('{err}', data.syncError ?? ''));
                        setStep('idle');
                        onChanged();
                      } catch (e) {
                        toast.error(apiError(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {t('resPool.resetConfirm')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t('resPool.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
