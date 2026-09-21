import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/dialog';
import { useT } from '@/lib/i18n';

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style destructif (rouge) pour les actions irréversibles — purge, suppression, etc. */
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<ConfirmFn | null>(null);

/**
 * Remplace `window.confirm()` par une modale cohérente avec le reste du
 * design system. `useConfirm()` renvoie une fonction imperative — même
 * usage qu'un `confirm()` natif, mais async : `if (await confirm({...}))`.
 */
export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>();

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    setOpts(null);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Dialog open={!!opts} onOpenChange={(o) => !o && settle(false)}>
        {opts && (
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {opts.destructive && <AlertTriangle className="h-5 w-5 text-destructive" />}
                {opts.title}
              </DialogTitle>
              {opts.description && <DialogDescription>{opts.description}</DialogDescription>}
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => settle(false)}>
                {opts.cancelLabel ?? t('common.cancel')}
              </Button>
              <Button variant={opts.destructive ? 'destructive' : 'default'} onClick={() => settle(true)}>
                {opts.confirmLabel ?? t('common.confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Ctx.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmDialogProvider');
  return ctx;
}
