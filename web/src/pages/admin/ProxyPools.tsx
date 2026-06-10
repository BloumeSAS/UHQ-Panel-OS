import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Layers } from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
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
  createdAt: string;
}

const DEFAULT_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

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
                  <TD colSpan={4} className="py-12 text-center text-muted-foreground">
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

function CreateDialog({ onCreated }: { onCreated: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', color: '#6366f1' });
  const [error, setError] = useState('');
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/proxy-pools', {
        name: form.name,
        description: form.description || undefined,
        color: form.color,
      });
      setOpen(false);
      setForm({ name: '', description: '', color: '#6366f1' });
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
      <DialogContent>
        <DialogHeader><DialogTitle>{t('pools.create')}</DialogTitle></DialogHeader>
        <PoolForm form={form} set={set} error={error} onSubmit={submit} submitLabel={t('common.create')} />
      </DialogContent>
    </Dialog>
  );
}

// ── Edit dialog ───────────────────────────────────────────────────────────────

function EditDialog({ pool, onClose, onSaved }: { pool: ProxyPool; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const [form, setForm] = useState({ name: pool.name, description: pool.description ?? '', color: pool.color ?? '#6366f1' });
  const [error, setError] = useState('');
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.patch(`/proxy-pools/${pool.id}`, {
        name: form.name,
        description: form.description || undefined,
        color: form.color,
      });
      toast.success(t('pools.updated'));
      onSaved();
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('pools.editTitle')}</DialogTitle></DialogHeader>
        <PoolForm form={form} set={set} error={error} onSubmit={submit} submitLabel={t('common.save')} />
      </DialogContent>
    </Dialog>
  );
}

// ── Shared form ───────────────────────────────────────────────────────────────

function PoolForm({
  form, set, error, onSubmit, submitLabel,
}: {
  form: { name: string; description: string; color: string };
  set: (k: string, v: string) => void;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
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
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="submit">{submitLabel}</Button>
      </DialogFooter>
    </form>
  );
}
