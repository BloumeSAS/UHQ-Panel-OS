import { useEffect, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface StatusBody {
  status: 'operational' | 'degraded' | 'outage';
  updatedAt: string;
  message: string;
  siteName: string;
  logoUrl?: string;
  components: { id: 'panel' | 'proxy' | 'pool'; ok: boolean }[];
  addons?: { id: string; name: string; ok: boolean }[];
  ports?: { id: string; label: string; port: number; ok: boolean }[];
}

/** Page d'état publique (/status) — activée dans Paramètres → Général, sans connexion requise. */
export default function Status() {
  const t = useT();
  const [data, setData] = useState<StatusBody | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () =>
      axios
        .get<StatusBody>('/api/status', { timeout: 10000 })
        .then((r) => alive && (setData(r.data), setError('')))
        .catch((e) => alive && setError(e?.response?.status === 404 ? t('status.disabled') : t('status.unreachable')));
    load();
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tone =
    data?.status === 'operational'
      ? { cls: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-600', Icon: CheckCircle2 }
      : data?.status === 'degraded'
        ? { cls: 'border-amber-500/40 bg-amber-500/5 text-amber-600', Icon: AlertTriangle }
        : { cls: 'border-destructive/40 bg-destructive/5 text-destructive', Icon: XCircle };

  return (
    <div className="flex min-h-screen items-start justify-center bg-muted/30 p-4 pt-16">
      <div className="w-full max-w-xl space-y-5">
        <div className="text-center">
          <img src={data?.logoUrl || '/static/logo.png'} alt="" className="mx-auto mb-2 h-12 w-12 rounded" />
          <h1 className="text-2xl font-bold">{data?.siteName || t('status.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('status.title')}</p>
        </div>

        {error && <p className="rounded-xl border bg-background p-4 text-center text-sm text-muted-foreground">{error}</p>}

        {data && (
          <>
            <div className={cn('flex items-center gap-3 rounded-xl border p-4 font-semibold', tone.cls)}>
              <tone.Icon className="h-6 w-6" />
              {t(`status.${data.status}`)}
            </div>
            {data.message && <p className="rounded-xl border bg-background p-4 text-sm whitespace-pre-line">{data.message}</p>}
            <ul className="divide-y rounded-xl border bg-background">
              {data.components.map((c) => (
                <li key={c.id} className="flex items-center justify-between p-4 text-sm">
                  <span>{t(`status.${c.id}`)}</span>
                  <span className={cn('inline-flex items-center gap-1.5 font-medium', c.ok ? 'text-emerald-600' : 'text-destructive')}>
                    {c.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {c.ok ? t('status.up') : t('status.down')}
                  </span>
                </li>
              ))}
            </ul>
            {(data.addons?.length ?? 0) > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('status.addons')}</h2>
                <ul className="divide-y rounded-xl border bg-background">
                  {data.addons!.map((a) => <StatusRow key={a.id} label={a.name} ok={a.ok} />)}
                </ul>
              </section>
            )}
            {(data.ports?.length ?? 0) > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('status.ports')}</h2>
                <ul className="divide-y rounded-xl border bg-background">
                  {data.ports!.map((p) => (
                    <StatusRow key={p.id} label={<>{p.label || t('status.proxyPort')} <span className="font-mono text-xs text-muted-foreground">:{p.port}</span></>} ok={p.ok} />
                  ))}
                </ul>
              </section>
            )}
            <p className="text-center text-xs text-muted-foreground">
              {t('status.updated')} : {new Date(data.updatedAt).toLocaleString()}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function StatusRow({ label, ok }: { label: React.ReactNode; ok: boolean }) {
  const t = useT();
  return (
    <li className="flex items-center justify-between p-4 text-sm">
      <span>{label}</span>
      <span className={cn('inline-flex items-center gap-1.5 font-medium', ok ? 'text-emerald-600' : 'text-destructive')}>
        {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        {ok ? t('status.up') : t('status.down')}
      </span>
    </li>
  );
}
