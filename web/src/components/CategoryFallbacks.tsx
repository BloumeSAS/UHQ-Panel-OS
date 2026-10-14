import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { Button, Input, Switch } from '@/components/ui';

interface Pool {
  id: string;
  name: string;
  color: string | null;
  fallbackProxyUrl: string | null;
  fallbackEnabled: boolean;
}

/** Paramètres → Fallback par catégorie : proxy de secours propre à chaque catégorie (il n'y a pas de fallback global). */
export function CategoryFallbacks() {
  const t = useT();
  const { data: pools = [] } = useQuery({
    queryKey: ['proxy-pools'],
    queryFn: async () => ((await api.get('/proxy-pools')).data.data ?? []) as Pool[],
  });

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <p className="text-sm font-semibold">{t('catFb.title')}</p>
        <p className="text-xs text-muted-foreground">{t('catFb.hint')}</p>
      </div>
      {pools.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('catFb.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {pools.map((p) => (
            <Row key={p.id + String(p.fallbackProxyUrl) + String(p.fallbackEnabled)} pool={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ pool }: { pool: Pool }) {
  const t = useT();
  const qc = useQueryClient();
  const [url, setUrl] = useState(pool.fallbackProxyUrl ?? '');
  const [enabled, setEnabled] = useState(pool.fallbackEnabled);
  const dirty = url !== (pool.fallbackProxyUrl ?? '') || enabled !== pool.fallbackEnabled;

  const save = useMutation({
    mutationFn: async () => api.patch(`/proxy-pools/${pool.id}`, { fallbackProxyUrl: url.trim() || null, fallbackEnabled: enabled }),
    onSuccess: () => {
      toast.success(t('catFb.saved'));
      void qc.invalidateQueries({ queryKey: ['proxy-pools'] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <li className="grid gap-2 rounded-md border p-3 sm:grid-cols-[10rem_1fr_auto_auto] sm:items-center">
      <span className="flex items-center gap-2 text-sm font-medium">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: pool.color ?? '#6366f1' }} />
        {pool.name}
      </span>
      <Input
        type={url.includes('•') ? 'password' : 'text'}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onFocus={(e) => url.includes('•') && e.currentTarget.select()}
        placeholder={t('catFb.none')}
        className="font-mono text-xs"
        autoComplete="off"
        disabled={!enabled}
      />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <Switch checked={enabled} onCheckedChange={setEnabled} />
        {t('catFb.enabled')}
      </label>
      <Button type="button" size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
        {t('common.save')}
      </Button>
    </li>
  );
}
