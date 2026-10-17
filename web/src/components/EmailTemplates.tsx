import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Pencil, Send, RotateCcw, Mail, ShieldCheck, UserCog, Users, ShoppingCart, Wallet, Ticket } from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { Badge, Button, Input, Label, Switch } from '@/components/ui';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/dialog';
import { cn } from '@/lib/utils';

type Lang = 'fr' | 'en';
interface Tpl {
  id: string;
  group: string;
  audience: 'user' | 'admin' | 'customer';
  enabled: boolean;
  toggleLocked: boolean;
  controlledBy: string | null;
  editable: boolean;
  addon: boolean;
  vars: string[];
  subject: Record<Lang, string>;
  body: Record<Lang, string>;
  defaults: { subject: Record<Lang, string>; body: Record<Lang, string> };
  customized: boolean;
}

const GROUPS: { id: string; icon: React.ElementType }[] = [
  { id: 'account', icon: Mail },
  { id: 'security', icon: ShieldCheck },
  { id: 'admin', icon: UserCog },
  { id: 'customers', icon: Users },
  { id: 'orders', icon: ShoppingCart },
  { id: 'wallet', icon: Wallet },
  { id: 'promo', icon: Ticket },
];

/** Liste des modèles d'e-mails : interrupteur par envoi, aperçu fidèle, édition FR/EN, envoi de test. */
export function EmailTemplates({ defaultLang }: { defaultLang: Lang }) {
  const t = useT();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['mail-templates'],
    queryFn: async () => (await api.get('/mail/templates')).data as { data: Tpl[]; smtpConfigured: boolean },
  });
  const [editing, setEditing] = useState<Tpl | null>(null);
  const [previewing, setPreviewing] = useState<Tpl | null>(null);
  const [testing, setTesting] = useState<Tpl | null>(null);

  const list = data?.data ?? [];
  const toggle = async (tpl: Tpl, enabled: boolean) => {
    try {
      await api.put(`/mail/templates/${tpl.id}`, { enabled });
      await qc.invalidateQueries({ queryKey: ['mail-templates'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  if (!data) return <p className="text-sm text-muted-foreground">{t('app.loading')}</p>;

  return (
    <div className="space-y-5">
      {!data.smtpConfigured && <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">{t('mail.smtpMissing')}</p>}
      {GROUPS.map(({ id, icon: Icon }) => {
        const rows = list.filter((x) => x.group === id);
        if (!rows.length) return null;
        return (
          <section key={id} className="space-y-2">
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Icon className="h-3.5 w-3.5" /> {t(`mail.g.${id}`)}
            </h4>
            <ul className="divide-y rounded-lg border bg-card">
              {rows.map((tpl) => (
                <li key={tpl.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{t(`mail.t.${tpl.id}.n`)}</span>
                      {tpl.customized && <Badge variant="secondary" className="text-[10px]">{t('mail.customized')}</Badge>}
                      {tpl.addon && <Badge variant="outline" className="text-[10px]">addon</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{t(`mail.t.${tpl.id}.d`)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setPreviewing(tpl)} title={t('mail.preview')}><Eye className="h-4 w-4" /></Button>
                    {tpl.editable && <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(tpl)} title={t('mail.edit')}><Pencil className="h-4 w-4" /></Button>}
                    <Button type="button" variant="ghost" size="sm" onClick={() => setTesting(tpl)} title={t('mail.sendTest')} disabled={!data.smtpConfigured}><Send className="h-4 w-4" /></Button>
                    <span title={tpl.toggleLocked ? t('mail.toggleLocked') : undefined}>
                      <Switch checked={tpl.enabled} disabled={tpl.toggleLocked} onCheckedChange={(v) => void toggle(tpl, v)} aria-label={t(`mail.t.${tpl.id}.n`)} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {previewing && <PreviewDialog tpl={previewing} lang={defaultLang} onClose={() => setPreviewing(null)} />}
      {editing && <EditDialog tpl={editing} lang={defaultLang} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void qc.invalidateQueries({ queryKey: ['mail-templates'] }); }} />}
      {testing && <TestDialog tpl={testing} lang={defaultLang} onClose={() => setTesting(null)} />}
    </div>
  );
}

function usePreview(id: string, lang: Lang, draft?: { subject: string; body: string }) {
  const [res, setRes] = useState<{ subject: string; html: string } | null>(null);
  const key = JSON.stringify([id, lang, draft]);
  useEffect(() => {
    let alive = true;
    const h = setTimeout(() => {
      api.post(`/mail/templates/${id}/preview`, { lang, ...(draft ?? {}) })
        .then((r) => alive && setRes({ subject: r.data.subject, html: r.data.html }))
        .catch(() => alive && setRes(null));
    }, draft ? 350 : 0);
    return () => { alive = false; clearTimeout(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return res;
}

function MailFrame({ html }: { html: string }) {
  // sandbox="" : aucun script, aucun formulaire, aucune navigation — l'aperçu ne peut rien exécuter.
  return <iframe title="preview" sandbox="" srcDoc={html} className="h-[420px] w-full rounded-md border bg-white" />;
}

function PreviewDialog({ tpl, lang: initial, onClose }: { tpl: Tpl; lang: Lang; onClose: () => void }) {
  const t = useT();
  const [lang, setLang] = useState<Lang>(initial);
  const res = usePreview(tpl.id, lang);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t(`mail.t.${tpl.id}.n`)} — {t('mail.preview')}</DialogTitle></DialogHeader>
        <LangTabs value={lang} onChange={setLang} />
        <p className="text-xs text-muted-foreground">{t('mail.subject')} : <span className="font-medium text-foreground">{res?.subject ?? '…'}</span></p>
        {res ? <MailFrame html={res.html} /> : <p className="py-10 text-center text-sm text-muted-foreground">{t('app.loading')}</p>}
        <p className="text-[11px] text-muted-foreground">{t('mail.previewNote')}</p>
      </DialogContent>
    </Dialog>
  );
}

function LangTabs({ value, onChange }: { value: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="inline-flex rounded-md border p-0.5">
      {(['fr', 'en'] as Lang[]).map((l) => (
        <button key={l} type="button" onClick={() => onChange(l)} aria-pressed={value === l} className={cn('rounded px-3 py-1 text-xs font-medium', value === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}

function EditDialog({ tpl, lang: initial, onClose, onSaved }: { tpl: Tpl; lang: Lang; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const [lang, setLang] = useState<Lang>(initial);
  const [subject, setSubject] = useState<Record<Lang, string>>({ ...tpl.subject });
  const [body, setBody] = useState<Record<Lang, string>>({ ...tpl.body });
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const draft = useMemo(() => ({ subject: subject[lang], body: body[lang] }), [subject, body, lang]);
  const res = usePreview(tpl.id, lang, draft);

  const insert = (v: string) => {
    const el = area.current;
    const token = `{${v}}`;
    if (!el) return setBody((b) => ({ ...b, [lang]: b[lang] + token }));
    const s = el.selectionStart ?? el.value.length;
    const e = el.selectionEnd ?? s;
    const next = el.value.slice(0, s) + token + el.value.slice(e);
    setBody((b) => ({ ...b, [lang]: next }));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); });
  };

  const save = async (reset = false) => {
    setBusy(true);
    try {
      await api.put(`/mail/templates/${tpl.id}`, reset ? { reset: true } : { subject, body });
      toast.success(t('settings.saved'));
      onSaved();
    } catch (e) {
      toast.error(apiError(e));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t(`mail.t.${tpl.id}.n`)}</DialogTitle></DialogHeader>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <LangTabs value={lang} onChange={setLang} />
            <div className="space-y-1.5">
              <Label>{t('mail.subject')}</Label>
              <Input value={subject[lang]} maxLength={200} onChange={(e) => setSubject((s) => ({ ...s, [lang]: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('mail.body')}</Label>
              <textarea
                ref={area}
                value={body[lang]}
                maxLength={5000}
                rows={12}
                onChange={(e) => setBody((b) => ({ ...b, [lang]: e.target.value }))}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-[11px] text-muted-foreground">{t('mail.syntax')}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('mail.variables')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {tpl.vars.map((v) => (
                  <button key={v} type="button" onClick={() => insert(v)} className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent">{`{${v}}`}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{t('mail.livePreview')}</Label>
            <p className="text-xs text-muted-foreground">{t('mail.subject')} : <span className="font-medium text-foreground">{res?.subject ?? '…'}</span></p>
            {res ? <MailFrame html={res.html} /> : <p className="py-10 text-center text-sm text-muted-foreground">{t('app.loading')}</p>}
          </div>
        </div>
        <DialogFooter className="gap-2 pt-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => void save(true)} disabled={busy || !tpl.customized}><RotateCcw className="mr-1.5 h-4 w-4" />{t('mail.reset')}</Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
            <Button type="button" onClick={() => void save()} disabled={busy}>{t('common.save')}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestDialog({ tpl, lang: initial, onClose }: { tpl: Tpl; lang: Lang; onClose: () => void }) {
  const t = useT();
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await api.post(`/mail/templates/${tpl.id}/test`, { to, lang: initial });
      toast.success(t('mail.testSent'));
      onClose();
    } catch (e) {
      toast.error(apiError(e));
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t(`mail.t.${tpl.id}.n`)} — {t('mail.sendTest')}</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label>{t('mail.testTo')}</Label>
          <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="vous@exemple.fr" autoFocus />
          <p className="text-[11px] text-muted-foreground">{t('mail.testNote')}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button type="button" onClick={() => void send()} disabled={busy || !/^\S+@\S+\.\S+$/.test(to)}>{t('mail.sendTest')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
