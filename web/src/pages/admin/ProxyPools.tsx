import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Layers, RefreshCw } from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Switch,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/dialog';
import { toast } from '@/lib/toast';

interface ProxyPool {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  port: number | null;
  domain: string | null;
  alwaysOnline: boolean;
  fakeCountries: string | null;
  fakeIpCountMin: number | null;
  fakeIpCountMax: number | null;
  fakeIpCountByCountry: Record<string, number> | null;
  createdAt: string;
}

const DEFAULT_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

function fakeIpTotal(pool: ProxyPool): number {
  return Object.values(pool.fakeIpCountByCountry ?? {}).reduce((a, b) => a + b, 0);
}

function fakeIpDetail(pool: ProxyPool): string {
  return Object.entries(pool.fakeIpCountByCountry ?? {})
    .sort(([, a], [, b]) => b - a)
    .map(([c, n]) => `${c}: ${n.toLocaleString()}`)
    .join(' · ');
}

export default function ProxyPools() {
  const t = useT();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ProxyPool | null>(null);

  const { data } = useQuery({
    queryKey: ['proxy-pools'],
    queryFn: async () => (await api.get('/proxy-pools')).data.data as ProxyPool[],
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['proxy-pools'] });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/proxy-pools/${id}`),
    onSuccess: () => { invalidate(); toast.success(t('pools.deleted')); },
    onError: (e: any) => toast.error(e.response?.data?.message || t('common.error')),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6" /> {t('pools.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('pools.subtitle')}</p>
        </div>
        <CreateDialog onCreated={invalidate} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>{t('pools.name')}</TH>
                <TH>{t('pools.description')}</TH>
                <TH>{t('pools.color')}</TH>
                <TH>{t('pools.port')}</TH>
                <TH>{t('pools.domain')}</TH>
                <TH className="text-right">{t('common.actions')}</TH>
              </TR>
            </THead>
            <TBody>
              {data?.map((pool) => (
                <TR key={pool.id}>
                  <TD className="font-medium">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: pool.color ?? '#6366f1' }}
                      />
                      {pool.name}
                      {pool.alwaysOnline && (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 text-[10px]"
                        >
                          {t('pools.alwaysOnline')}
                        </Badge>
                      )}
                      {!!fakeIpTotal(pool) && (
                        <Badge
                          variant="secondary"
                          className="bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 text-[10px]"
                          title={fakeIpDetail(pool)}
                        >
                          +{fakeIpTotal(pool).toLocaleString()} IP
                        </Badge>
                      )}
                    </div>
                  </TD>
                  <TD className="text-sm text-muted-foreground">{pool.description || '—'}</TD>
                  <TD>
                    <Badge
                      variant="outline"
                      className="font-mono text-[10px]"
                      style={{ borderColor: pool.color ?? '#6366f1', color: pool.color ?? '#6366f1' }}
                    >
                      {pool.color ?? '#6366f1'}
                    </Badge>
                  </TD>
                  <TD className="font-mono text-sm text-muted-foreground">{pool.port ?? '—'}</TD>
                  <TD className="font-mono text-sm text-muted-foreground">{pool.domain || '—'}</TD>
                  <TD className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(pool)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => confirm(t('pools.confirmDelete')) && del.mutate(pool.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TD>
                </TR>
              ))}
              {!data?.length && (
                <TR>
                  <TD colSpan={6} className="py-12 text-center text-muted-foreground">
                    <Layers className="mx-auto mb-3 h-8 w-8 opacity-20" />
                    {t('pools.none')}
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {editing && (
        <EditDialog
          pool={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); invalidate(); }}
        />
      )}
    </div>
  );
}

// ── Create dialog ─────────────────────────────────────────────────────────────

const EMPTY_POOL_FORM = {
  name: '', description: '', color: '#6366f1', port: '', domain: '',
  alwaysOnline: false,
  fakeCountries: '',
  fakeIpMode: 'fixed' as 'fixed' | 'random',
  fakeIpFixed: '',
  fakeIpMin: '',
  fakeIpMax: '',
};

function CreateDialog({ onCreated }: { onCreated: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_POOL_FORM);
  const [error, setError] = useState('');
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const fakeMin = form.fakeIpMode === 'fixed' ? form.fakeIpFixed : form.fakeIpMin;
      const fakeMax = form.fakeIpMode === 'fixed' ? form.fakeIpFixed : form.fakeIpMax;
      await api.post('/proxy-pools', {
        name: form.name,
        description: form.description || undefined,
        color: form.color,
        port: form.port ? Number(form.port) : undefined,
        domain: form.domain || undefined,
        alwaysOnline: form.alwaysOnline,
        fakeCountries: form.fakeCountries || undefined,
        fakeIpCountMin: fakeMin ? Number(fakeMin) : undefined,
        fakeIpCountMax: fakeMax ? Number(fakeMax) : undefined,
      });
      setOpen(false);
      setForm(EMPTY_POOL_FORM);
      toast.success(t('pools.created'));
      onCreated();
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> {t('pools.create')}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t('pools.create')}</DialogTitle></DialogHeader>
        <PoolForm form={form} set={set} error={error} onSubmit={submit} submitLabel={t('common.create')} />
      </DialogContent>
    </Dialog>
  );
}

// ── Edit dialog ───────────────────────────────────────────────────────────────

function EditDialog({ pool, onClose, onSaved }: { pool: ProxyPool; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const isRandom = pool.fakeIpCountMin != null && pool.fakeIpCountMax != null && pool.fakeIpCountMin !== pool.fakeIpCountMax;
  const [form, setForm] = useState({
    name: pool.name,
    description: pool.description ?? '',
    color: pool.color ?? '#6366f1',
    port: pool.port != null ? String(pool.port) : '',
    domain: pool.domain ?? '',
    alwaysOnline: pool.alwaysOnline,
    fakeCountries: pool.fakeCountries ?? '',
    fakeIpMode: (isRandom ? 'random' : 'fixed') as 'fixed' | 'random',
    fakeIpFixed: !isRandom && pool.fakeIpCountMin != null ? String(pool.fakeIpCountMin) : '',
    fakeIpMin: pool.fakeIpCountMin != null ? String(pool.fakeIpCountMin) : '',
    fakeIpMax: pool.fakeIpCountMax != null ? String(pool.fakeIpCountMax) : '',
  });
  const [error, setError] = useState('');
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const reroll = useMutation({
    mutationFn: () => api.post(`/proxy-pools/${pool.id}/reroll-fake-ips`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proxy-pools'] });
      toast.success(t('pools.fakeIpRerolled'));
    },
    onError: (e: any) => toast.error(e.response?.data?.message || t('common.error')),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const fakeMin = form.fakeIpMode === 'fixed' ? form.fakeIpFixed : form.fakeIpMin;
      const fakeMax = form.fakeIpMode === 'fixed' ? form.fakeIpFixed : form.fakeIpMax;
      await api.patch(`/proxy-pools/${pool.id}`, {
        name: form.name,
        description: form.description || undefined,
        color: form.color,
        port: form.port ? Number(form.port) : null,
        domain: form.domain || null,
        alwaysOnline: form.alwaysOnline,
        fakeCountries: form.fakeCountries || null,
        fakeIpCountMin: fakeMin ? Number(fakeMin) : null,
        fakeIpCountMax: fakeMax ? Number(fakeMax) : null,
      });
      toast.success(t('pools.updated'));
      onSaved();
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t('pools.editTitle')}</DialogTitle></DialogHeader>
        <PoolForm
          form={form}
          set={set}
          error={error}
          onSubmit={submit}
          submitLabel={t('common.save')}
          fakeIpDetail={fakeIpDetail(pool)}
          onReroll={() => reroll.mutate()}
          rerolling={reroll.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}

// ── Shared form ───────────────────────────────────────────────────────────────

function PoolForm({
  form, set, error, onSubmit, submitLabel, fakeIpDetail, onReroll, rerolling,
}: {
  form: {
    name: string; description: string; color: string; port: string; domain: string;
    alwaysOnline: boolean; fakeCountries: string; fakeIpMode: 'fixed' | 'random';
    fakeIpFixed: string; fakeIpMin: string; fakeIpMax: string;
  };
  set: (k: string, v: any) => void;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
  fakeIpDetail?: string;
  onReroll?: () => void;
  rerolling?: boolean;
}) {
  const t = useT();
  return (
    <form onSubmit={onSubmit} className="space-y-4 pt-2">
      <div className="space-y-1.5">
        <Label>{t('pools.name')}</Label>
        <Input
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder={t('pools.namePlaceholder')}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label>{t('pools.description')}</Label>
        <Input
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder={t('pools.descriptionPlaceholder')}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{t('pools.color')}</Label>
        <div className="flex items-center gap-2 flex-wrap">
          {DEFAULT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => set('color', c)}
              className={`h-7 w-7 rounded-full transition-transform ${form.color === c ? 'scale-125 ring-2 ring-offset-1 ring-foreground' : ''}`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            type="color"
            value={form.color}
            onChange={(e) => set('color', e.target.value)}
            className="h-7 w-16 cursor-pointer rounded border border-input bg-transparent p-0.5"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t('pools.port')}</Label>
        <Input
          type="number"
          min={9000}
          max={9999}
          value={form.port}
          onChange={(e) => set('port', e.target.value)}
          placeholder={t('pools.portPlaceholder')}
        />
        <p className="text-xs text-muted-foreground">{t('pools.portHint')}</p>
      </div>
      <div className="space-y-1.5">
        <Label>{t('pools.domain')}</Label>
        <Input
          value={form.domain}
          onChange={(e) => set('domain', e.target.value)}
          placeholder={t('pools.domainPlaceholder')}
        />
        <p className="text-xs text-muted-foreground">{t('pools.domainHint')}</p>
      </div>

      <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3 gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">{t('pools.alwaysOnline')}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{t('pools.alwaysOnlineHint')}</p>
        </div>
        <Switch checked={form.alwaysOnline} onCheckedChange={(v) => set('alwaysOnline', v)} />
      </div>

      <div className="space-y-1.5">
        <Label>{t('pools.fakeCountries')}</Label>
        <Input
          value={form.fakeCountries}
          onChange={(e) => set('fakeCountries', e.target.value)}
          placeholder={t('pools.fakeCountriesPlaceholder')}
        />
        <p className="text-xs text-muted-foreground">{t('pools.fakeCountriesHint')}</p>
      </div>

      <div className="space-y-1.5">
        <Label>{t('pools.fakeIpCount')}</Label>
        <select
          value={form.fakeIpMode}
          onChange={(e) => set('fakeIpMode', e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:ring-1 focus:ring-ring"
        >
          <option value="fixed">{t('pools.fakeIpModeFixed')}</option>
          <option value="random">{t('pools.fakeIpModeRandom')}</option>
        </select>
        {form.fakeIpMode === 'fixed' ? (
          <Input
            type="number"
            min={0}
            value={form.fakeIpFixed}
            onChange={(e) => set('fakeIpFixed', e.target.value)}
            placeholder="150000"
          />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              min={0}
              value={form.fakeIpMin}
              onChange={(e) => set('fakeIpMin', e.target.value)}
              placeholder="100000"
            />
            <Input
              type="number"
              min={0}
              value={form.fakeIpMax}
              onChange={(e) => set('fakeIpMax', e.target.value)}
              placeholder="300000"
            />
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t('pools.fakeIpCountHint')}</p>
        {onReroll && (
          <>
            {!!fakeIpDetail && <p className="text-xs text-muted-foreground">{fakeIpDetail}</p>}
            <Button type="button" variant="outline" size="sm" onClick={onReroll} disabled={rerolling}>
              <RefreshCw className={`h-3.5 w-3.5 ${rerolling ? 'animate-spin' : ''}`} /> {t('pools.fakeIpReroll')}
            </Button>
            <p className="text-xs text-muted-foreground">{t('pools.fakeIpRerollHint')}</p>
          </>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="submit">{submitLabel}</Button>
      </DialogFooter>
    </form>
  );
}
