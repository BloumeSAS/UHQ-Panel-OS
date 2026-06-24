import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Link2, Download, CheckSquare, Square, ShieldCheck, UserPlus, Clock, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import { AddonPageBar } from '@/components/AddonPageBar';
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

interface PanelUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
  is_active: boolean;
  expires_at: string | null;
  totp_enabled: boolean;
  created_at: string;
  assigned_proxies: { id: string; username: string; name: string }[];
}

export default function Users() {
  const t = useT();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data.data as PanelUser[],
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });

  const patch = useMutation({
    mutationFn: (v: { id: string; body: any }) => api.patch(`/users/${v.id}`, v.body),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: invalidate,
  });

  const [assignFor, setAssignFor] = useState<PanelUser | null>(null);
  const [editFor, setEditFor] = useState<PanelUser | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const totalPages = Math.ceil((data?.length ?? 0) / PAGE_SIZE);
  const pagedData = data?.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Bulk operations
  const bulkMutation = useMutation({
    mutationFn: (v: { action: string; ids: string[] }) => api.post('/users/bulk', v),
    onSuccess: () => {
      invalidate();
      setSelected(new Set());
      toast.success(t('users.bulkDone'));
    },
    onError: (e: any) => toast.error(e.response?.data?.message || t('common.error')),
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === data?.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data?.map((u) => u.id) ?? []));
    }
  };

  const downloadCsv = async () => {
    try {
      const { data: res } = await api.get('/users/export.csv');
      const blob = new Blob([res.csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'users.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('common.error'));
    }
  };

  const isExpired = (expiresAt: string | null) =>
    expiresAt && new Date(expiresAt) < new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">{t('nav.users')}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadCsv} title={t('users.exportCsv')}>
            <Download className="h-4 w-4" />
          </Button>
          <InviteDialog />
          <CreateDialog onCreated={invalidate} />
        </div>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/40 border">
          <span className="text-sm font-medium">{selected.size} {t('users.selected')}</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => bulkMutation.mutate({ action: 'activate', ids: Array.from(selected) })}>
              {t('users.bulkActivate')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkMutation.mutate({ action: 'deactivate', ids: Array.from(selected) })}>
              {t('users.bulkDeactivate')}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => confirm(t('common.confirmDelete')) && bulkMutation.mutate({ action: 'delete', ids: Array.from(selected) })}>
              {t('common.delete')}
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH className="w-8">
                  <button onClick={toggleAll} className="flex items-center justify-center">
                    {selected.size === data?.length && data?.length > 0
                      ? <CheckSquare className="h-4 w-4" />
                      : <Square className="h-4 w-4" />
                    }
                  </button>
                </TH>
                <TH>{t('auth.email')}</TH>
                <TH>{t('users.role')}</TH>
                <TH>{t('users.active')}</TH>
                <TH>{t('users.expiry')}</TH>
                <TH>{t('users.createdAt')}</TH>
                <TH>{t('users.security')}</TH>
                <TH>{t('users.assignedProxies')}</TH>
                <TH className="text-right">{t('common.actions')}</TH>
              </TR>
            </THead>
            <TBody>
              {pagedData?.map((u) => (
                <TR key={u.id} className={isExpired(u.expires_at) ? 'opacity-50' : ''}>
                  <TD>
                    <button onClick={() => toggleSelect(u.id)} className="flex items-center justify-center">
                      {selected.has(u.id)
                        ? <CheckSquare className="h-4 w-4 text-primary" />
                        : <Square className="h-4 w-4 text-muted-foreground" />
                      }
                    </button>
                  </TD>
                  <TD className="font-medium">
                    {u.email}
                    {isExpired(u.expires_at) && (
                      <span className="ml-2 text-xs text-destructive">({t('users.expired')})</span>
                    )}
                  </TD>
                  <TD>
                    <Badge variant={u.role === 'ADMIN' ? 'default' : 'secondary'}>{u.role}</Badge>
                  </TD>
                  <TD>
                    <Switch
                      checked={u.is_active}
                      onCheckedChange={(v) => patch.mutate({ id: u.id, body: { isActive: v } })}
                    />
                  </TD>
                  <TD>
                    {u.expires_at
                      ? <span className={`text-xs flex items-center gap-1 ${isExpired(u.expires_at) ? 'text-destructive' : 'text-muted-foreground'}`}>
                          <Clock className="h-3 w-3" />
                          {new Date(u.expires_at).toLocaleDateString()}
                        </span>
                      : <span className="text-xs text-muted-foreground">—</span>
                    }
                  </TD>
                  <TD>
                    <span className="text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </span>
                  </TD>
                  <TD>
                    {u.totp_enabled && (
                      <ShieldCheck className="h-4 w-4 text-green-500" />
                    )}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {u.assigned_proxies.map((p) => (
                        <Badge key={p.id} variant="outline">{p.username}</Badge>
                      ))}
                      {!u.assigned_proxies.length && <span className="text-muted-foreground">—</span>}
                    </div>
                  </TD>
                  <TD className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditFor(u)} title={t('common.edit')}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setAssignFor(u)} title={t('users.assign')}>
                      <Link2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => confirm(t('common.confirmDelete')) && del.mutate(u.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TD>
                </TR>
              ))}
              {!data?.length && (
                <TR>
                  <TD colSpan={9} className="py-8 text-center text-muted-foreground">{t('common.none')}</TD>
                </TR>
              )}
            </TBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="h-8 gap-1">
                <ChevronLeft className="h-3.5 w-3.5" /> Précédent
              </Button>
              <span className="text-xs text-muted-foreground">
                Page <span className="font-semibold">{page + 1}</span> / {totalPages}
                <span className="ml-2 text-muted-foreground/60">({data?.length} utilisateurs)</span>
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="h-8 gap-1">
                Suivant <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {editFor && <EditDialog user={editFor} onClose={() => setEditFor(null)} onChanged={invalidate} />}
      {assignFor && <AssignDialog user={assignFor} onClose={() => setAssignFor(null)} onChanged={invalidate} />}

      <AddonPageBar />
    </div>
  );
}

function EditDialog({ user, onClose, onChanged }: { user: PanelUser; onClose: () => void; onChanged: () => void }) {
  const t = useT();
  const [form, setForm] = useState({
    email: user.email,
    role: user.role,
    password: '',
    expiresAt: user.expires_at ? new Date(user.expires_at).toISOString().split('T')[0] : '',
    isActive: user.is_active,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const body: any = {
        email: form.email,
        role: form.role,
        isActive: form.isActive,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      };
      if (form.password) body.password = form.password;
      await api.patch(`/users/${user.id}`, body);
      onChanged();
      onClose();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t('users.editTitle')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('auth.email')}</Label>
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>{t('users.role')}</Label>
            <select value={form.role} onChange={(e) => set('role', e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('users.newPassword')}</Label>
            <Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder={t('users.passwordOptional')} minLength={8} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('users.expiresAt')}</Label>
            <Input type="date" value={form.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} />
          </div>
          <div className="flex items-center justify-between">
            <Label>{t('users.active')}</Label>
            <Switch checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={loading}>{t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InviteDialog() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('USER');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/invitations', { email, role });
      setSent(true);
      setTimeout(() => { setSent(false); setOpen(false); setEmail(''); }, 2000);
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlus className="h-4 w-4 mr-2" />
          {t('users.invite')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t('users.inviteTitle')}</DialogTitle></DialogHeader>
        {sent ? (
          <p className="text-sm text-green-600 py-4 text-center">✅ {t('users.inviteSent')}</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('auth.email')}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.emailPlaceholder')} required />
            </div>
            <div className="space-y-1.5">
              <Label>{t('users.role')}</Label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter><Button type="submit">{t('users.sendInvite')}</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateDialog({ onCreated }: { onCreated: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', role: 'USER', expiresAt: '' });
  const [error, setError] = useState('');
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/users', {
        email: form.email,
        password: form.password,
        role: form.role,
        ...(form.expiresAt ? { expiresAt: new Date(form.expiresAt).toISOString() } : {}),
      });
      setOpen(false);
      setForm({ email: '', password: '', role: 'USER', expiresAt: '' });
      onCreated();
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> {t('users.create')}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t('users.create')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('auth.email')}</Label>
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder={t('auth.emailPlaceholder')} required />
          </div>
          <div className="space-y-1.5">
            <Label>{t('auth.password')}</Label>
            <Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder={t('auth.passwordPlaceholder')} required minLength={8} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('users.role')}</Label>
            <select value={form.role} onChange={(e) => set('role', e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('users.expiresAt')}</Label>
            <Input type="date" value={form.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button type="submit">{t('common.create')}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({ user, onClose, onChanged }: { user: PanelUser; onClose: () => void; onChanged: () => void; }) {
  const t = useT();
  const qc = useQueryClient();
  const { data: all } = useQuery({
    queryKey: ['subusers'],
    queryFn: async () => (await api.get('/subusers')).data.data as { id: string; username: string }[],
  });
  const assigned = new Set(user.assigned_proxies.map((p) => p.id));

  const toggle = useMutation({
    mutationFn: (v: { proxyId: string; assign: boolean }) =>
      api.post(`/users/${user.id}/${v.assign ? 'assign' : 'unassign'}`, { proxyId: v.proxyId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); onChanged(); },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('users.assignedProxies')} — {user.email}</DialogTitle>
        </DialogHeader>
        <div className="max-h-80 space-y-1 overflow-auto">
          {all?.map((p) => {
            const isAssigned = assigned.has(p.id);
            return (
              <div key={p.id} className="flex items-center justify-between rounded-md border p-2">
                <span className="font-mono text-xs">{p.username}</span>
                <Button size="sm" variant={isAssigned ? 'destructive' : 'outline'} onClick={() => toggle.mutate({ proxyId: p.id, assign: !isAssigned })}>
                  {isAssigned ? t('users.unassign') : t('users.assign')}
                </Button>
              </div>
            );
          })}
          {!all?.length && <p className="text-sm text-muted-foreground">{t('common.none')}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
