import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Blocks, Loader2, RotateCw } from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Badge, Card, CardContent, Switch } from '@/components/ui';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';

interface ExtensionRow {
  key: string;
  nameKey: string;
  descKey: string;
  version: string;
  enabled: boolean;
  active: boolean;
  restartPending: boolean;
}

/**
 * Après avoir déclenché un restart (extension activée/désactivée), l'API
 * redémarre en quelques secondes (Docker `restart: unless-stopped` relance
 * le process après le `process.exit(0)` côté ExtensionsService). On poll
 * `/health` : d'abord une erreur réseau (process éteint), puis un 200
 * (process relancé) — c'est ce deuxième 200 qui referme le modal, pas
 * juste "la requête a répondu une fois" (le tout premier appel, juste avant
 * l'exit, peut encore réussir).
 */
async function waitForRestart(onTick: (elapsedSec: number) => void): Promise<void> {
  const start = Date.now();
  let sawDown = false;
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    onTick(Math.round((Date.now() - start) / 1000));
    try {
      // `/health` est une route racine (pas sous /api/panel) — appel direct,
      // pas via le client `api` (baseURL /api/panel).
      await axios.get('/health', { timeout: 3000 });
      if (sawDown) return;
    } catch {
      sawDown = true;
    }
    if (Date.now() - start > 120_000) return; // filet de sécurité — n'attend jamais indéfiniment
  }
}

export default function Extensions() {
  const t = useT();
  const qc = useQueryClient();
  const [restarting, setRestarting] = useState<{ key: string; action: 'enable' | 'disable' } | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const busyKeys = useRef(new Set<string>());

  const { data, isLoading } = useQuery({
    queryKey: ['extensions'],
    queryFn: async () => (await api.get('/extensions')).data.data as ExtensionRow[],
    // Pendant qu'un restart est en cours, le process peut être injoignable —
    // évite un poll agressif qui ne ferait qu'accumuler des erreurs réseau.
    refetchInterval: restarting ? false : undefined,
  });

  const toggle = async (ext: ExtensionRow, enabled: boolean) => {
    if (busyKeys.current.has(ext.key)) return;
    busyKeys.current.add(ext.key);
    try {
      const res = await api.post(`/extensions/${ext.key}/${enabled ? 'enable' : 'disable'}`);
      if (res.data?.data?.restarting) {
        setRestarting({ key: ext.key, action: enabled ? 'enable' : 'disable' });
        setElapsedSec(0);
        await waitForRestart(setElapsedSec);
        setRestarting(null);
        toast.success(enabled ? t('extensions.enabledToast') : t('extensions.disabledToast'));
        qc.invalidateQueries({ queryKey: ['extensions'] });
      } else {
        toast.success(enabled ? t('extensions.enabledToast') : t('extensions.disabledToast'));
        qc.invalidateQueries({ queryKey: ['extensions'] });
      }
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      busyKeys.current.delete(ext.key);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Blocks className="h-6 w-6" /> {t('extensions.title')}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('extensions.subtitle')}</p>
      </div>

      {isLoading && <p className="text-muted-foreground">{t('app.loading')}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {data?.map((ext) => (
          <Card key={ext.key}>
            <CardContent className="p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold">{t(ext.nameKey)}</h3>
                  <Badge variant="outline" className="font-mono text-[10px]">v{ext.version}</Badge>
                  {ext.enabled !== ext.active && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 text-[10px]">
                      {t('extensions.pendingRestart')}
                    </Badge>
                  )}
                  {ext.enabled === ext.active && ext.active && (
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 text-[10px]">
                      {t('extensions.active')}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1 leading-snug">{t(ext.descKey)}</p>
              </div>
              <Switch
                checked={ext.enabled}
                disabled={!!restarting}
                onCheckedChange={(v) => toggle(ext, v)}
              />
            </CardContent>
          </Card>
        ))}
        {!isLoading && !data?.length && (
          <p className="text-sm text-muted-foreground col-span-2 py-8 text-center">{t('extensions.none')}</p>
        )}
      </div>

      {/* ── Overlay de redémarrage — volontairement non-fermable : l'action est déjà en cours côté serveur. ── */}
      {restarting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-lg text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <RotateCw className={cn('h-6 w-6 text-primary', 'animate-spin')} />
            </div>
            <div>
              <h3 className="font-semibold">{t('extensions.restartingTitle')}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t('extensions.restartingBody')}</p>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('extensions.restartingElapsed').replace('{sec}', String(elapsedSec))}
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400">{t('extensions.restartingWarning')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
