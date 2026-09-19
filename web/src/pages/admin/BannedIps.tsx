import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldBan, Trash2, Plus, CheckSquare, Square } from 'lucide-react';
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
import { toast } from '@/lib/toast';

interface BannedIp {
  id: string;
  ip: string;
  reason: string | null;
  createdBy: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export default function BannedIps() {
  const t = useT();
  const qc = useQueryClient();
  const [ipsInput, setIpsInput] = useState('');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data } = useQuery({
    queryKey: ['banned-ips'],
    queryFn: async () => (await api.get('/banned-ips')).data.data as BannedIp[],
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['banned-ips'] });

  const banMutation = useMutation({
    mutationFn: () => {
      const ips = ipsInput
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      return api.post('/banned-ips', {
        ips,
        reason: reason || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
    },
    onSuccess: (res) => {
      toast.success(t('bannedIps.banned').replace('{n}', String(res.data.data.length)));
      setIpsInput('');
      setReason('');
      setExpiresAt('');
      invalidate();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const unbanMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/banned-ips/${id}`),
    onSuccess: () => {
      toast.success(t('bannedIps.unbanned'));
      invalidate();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const unbanManyMutation = useMutation({
    mutationFn: (ids: string[]) => api.post('/banned-ips/unban-many', { ids }),
    onSuccess: () => {
      toast.success(t('bannedIps.unbanned'));
      setSelected(new Set());
      invalidate();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = (data?.length ?? 0) > 0 && (data ?? []).every((b) => selected.has(b.id));
  const toggleAll = () => {
    if (!data) return;
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(data.map((b) => b.id)));
  };

  const ipCount = ipsInput.split(/[\n,]/).map((s) => s.trim()).filter(Boolean).length;
  const isExpired = (b: BannedIp) => b.expiresAt && new Date(b.expiresAt) < new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldBan className="h-6 w-6 text-destructive" />
          {t('bannedIps.title')}
        </h1>
        <p className="text-muted-foreground mt-1">{t('bannedIps.subtitle')}</p>
      </div>

      {/* Formulaire de bannissement */}
      <Card className="p-6 space-y-4">
        <div className="space-y-1.5">
          <Label>{t('bannedIps.ipsLabel')}</Label>
          <textarea
            value={ipsInput}
            onChange={(e) => setIpsInput(e.target.value)}
            placeholder={'1.2.3.4\n5.6.7.8\n9.10.11.12'}
            rows={4}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y"
          />
          <p className="text-xs text-muted-foreground">{t('bannedIps.ipsHint')}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <Label>{t('bannedIps.reasonLabel')}</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('bannedIps.reasonPlaceholder')} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('bannedIps.expiresLabel')}</Label>
            <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
        </div>
        <Button onClick={() => banMutation.mutate()} disabled={ipCount === 0 || banMutation.isPending}>
          <Plus className="h-4 w-4 mr-2" />
          {t('bannedIps.banAction')}{ipCount > 1 ? ` (${ipCount})` : ''}
        </Button>
      </Card>

      {/* Actions groupées */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/40 border">
          <span className="text-sm font-medium">{selected.size} {t('users.selected')}</span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto text-destructive border-destructive hover:bg-destructive/10"
            onClick={() => unbanManyMutation.mutate(Array.from(selected))}
            disabled={unbanManyMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            {t('bannedIps.unbanSelected')}
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH className="w-8">
                  <button onClick={toggleAll} className="flex items-center justify-center">
                    {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </button>
                </TH>
                <TH>{t('bannedIps.ip')}</TH>
                <TH>{t('bannedIps.reason')}</TH>
                <TH>{t('bannedIps.createdBy')}</TH>
                <TH>{t('bannedIps.expiresLabel')}</TH>
                <TH>{t('bannedIps.createdAt')}</TH>
                <TH className="text-right">{t('common.actions')}</TH>
              </TR>
            </THead>
            <TBody>
              {!data?.length && (
                <TR>
                  <TD colSpan={7} className="text-center text-muted-foreground py-8">
                    {t('bannedIps.empty')}
                  </TD>
                </TR>
              )}
              {data?.map((b) => (
                <TR key={b.id}>
                  <TD>
                    <button onClick={() => toggleSelect(b.id)} className="flex items-center justify-center">
                      {selected.has(b.id) ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </button>
                  </TD>
                  <TD className="font-mono text-xs">{b.ip}</TD>
                  <TD className="text-xs text-muted-foreground max-w-[220px] truncate">{b.reason || '—'}</TD>
                  <TD className="text-xs text-muted-foreground">{b.createdBy || '—'}</TD>
                  <TD className="text-xs">
                    {b.expiresAt ? (
                      <Badge variant={isExpired(b) ? 'outline' : 'destructive'} className="text-[10px]">
                        {isExpired(b) ? t('bannedIps.expired') : new Date(b.expiresAt).toLocaleString()}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">{t('bannedIps.permanent')}</span>
                    )}
                  </TD>
                  <TD className="text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleString()}</TD>
                  <TD className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => unbanMutation.mutate(b.id)}
                      disabled={unbanMutation.isPending}
                      title={t('bannedIps.unbanAction')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
