import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, FlaskConical, Play, Pencil } from 'lucide-react';
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

interface Source {
  id: string;
  name: string;
  url: string;
  protocol: string;
  pattern: string | null;
  enabled: boolean;
}

export default function Scraper() {
  const t = useT();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['scraper-sources'],
    queryFn: async () => (await api.get('/scraper-sources')).data.data as Source[],
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['scraper-sources'] });

  const toggle = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) =>
      api.patch(`/scraper-sources/${v.id}`, { enabled: v.enabled }),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/scraper-sources/${id}`),
    onSuccess: invalidate,
  });

  const [editing, setEditing] = useState<Source | null>(null);

  const [testResult, setTestResult] = useState<string>('');
  const test = async (id: string) => {
    setTestResult('…');
    try {
      const { data } = await api.post(`/scraper-sources/${id}/test`);
      setTestResult(
        data.status === 'success'
          ? `✓ ${data.count} proxies — ex: ${data.sample.join(', ') || '—'}`
          : `✗ ${data.message}`,
      );
    } catch (e) {
      setTestResult(`✗ ${apiError(e)}`);
    }
  };
  const runNow = () => api.post('/scraper-sources/run');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('scraper.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('scraper.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => runNow()}>
            <Play className="h-4 w-4" /> {t('scraper.runNow')}
          </Button>
          <CreateDialog onCreated={invalidate} />
        </div>
      </div>

      {testResult && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm font-mono">{testResult}</div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>{t('scraper.name')}</TH>
                <TH>{t('scraper.url')}</TH>
                <TH>{t('scraper.protocol')}</TH>
                <TH>{t('scraper.enabled')}</TH>
                <TH className="text-right">{t('common.actions')}</TH>
              </TR>
            </THead>
            <TBody>
              {data?.map((s) => (
                <TR key={s.id}>
                  <TD className="font-medium">{s.name}</TD>
                  <TD className="max-w-xs truncate font-mono text-xs">{s.url}</TD>
                  <TD><Badge variant="secondary">{s.protocol}</Badge></TD>
                  <TD>
                    <Switch
                      checked={s.enabled}
                      onCheckedChange={(v) => toggle.mutate({ id: s.id, enabled: v })}
                    />
                  </TD>
                  <TD className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => test(s.id)} title={t('scraper.test')}>
                      <FlaskConical className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(s)} title={t('common.edit')}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => confirm(t('common.confirmDelete')) && del.mutate(s.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TD>
                </TR>
              ))}
                      {!data?.length && (
                <TR><TD colSpan={5} className="py-8 text-center text-muted-foreground">{t('common.none')}</TD></TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      {editing && (
        <EditDialog source={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); invalidate(); }} />
      )}
    </div>
  );
}

function EditDialog({ source, onClose, onSaved }: { source: Source; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const [form, setForm] = useState({ name: source.name, url: source.url, protocol: source.protocol, pattern: source.pattern ?? '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.patch(`/scraper-sources/${source.id}`, {
        name: form.name,
        url: form.url,
        protocol: form.protocol,
        pattern: form.pattern || undefined,
      });
      onSaved();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('scraper.editTitle')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('scraper.name')}</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>{t('scraper.url')}</Label>
            <Input value={form.url} onChange={(e) => set('url', e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('scraper.protocol')}</Label>
              <select value={form.protocol} onChange={(e) => set('protocol', e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="auto">{t('scraper.protocolAuto')}</option>
                <option value="http">http</option>
                <option value="socks4">socks4</option>
                <option value="socks5">socks5</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('scraper.pattern')}</Label>
              <Input value={form.pattern} onChange={(e) => set('pattern', e.target.value)} placeholder={t('scraper.patternPlaceholder')} />
            </div>
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

function CreateDialog({ onCreated }: { onCreated: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', protocol: 'http', pattern: '' });
  const [error, setError] = useState('');
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/scraper-sources', {
        name: form.name,
        url: form.url,
        protocol: form.protocol,
        pattern: form.pattern || undefined,
      });
      setOpen(false);
      setForm({ name: '', url: '', protocol: 'http', pattern: '' });
      onCreated();
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> {t('scraper.create')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('scraper.create')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('scraper.name')}</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={t('scraper.namePlaceholder')} required />
          </div>
          <div className="space-y-1.5">
            <Label>{t('scraper.url')}</Label>
            <Input value={form.url} onChange={(e) => set('url', e.target.value)} required placeholder={t('scraper.urlPlaceholder')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('scraper.protocol')}</Label>
              <select
                value={form.protocol}
                onChange={(e) => set('protocol', e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="auto">{t('scraper.protocolAuto')}</option>
                <option value="http">http</option>
                <option value="socks4">socks4</option>
                <option value="socks5">socks5</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('scraper.pattern')}</Label>
              <Input value={form.pattern} onChange={(e) => set('pattern', e.target.value)} placeholder={t('scraper.patternPlaceholder')} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button type="submit">{t('common.create')}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
