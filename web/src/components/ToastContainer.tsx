import { useState, useEffect } from 'react';
import { subscribeToasts, ToastEvent } from '@/lib/toast';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ToastContainer() {
  const [toasts, setToasts] = useState<(ToastEvent & { removing?: boolean })[]>([]);

  useEffect(() => {
    const unsub = subscribeToasts((e) => {
      setToasts((prev) => [...prev, e]);
      // Auto-dismiss after 4 seconds
      setTimeout(() => {
        setToasts((prev) => prev.map((t) => (t.id === e.id ? { ...t, removing: true } : t)));
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== e.id));
        }, 300);
      }, 4000);
    });
    return unsub;
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg bg-card text-card-foreground transition-all duration-300',
            t.removing ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0',
            t.type === 'success' && 'border-green-500/40',
            t.type === 'error' && 'border-destructive/40',
            t.type === 'warning' && 'border-orange-400/40',
            t.type === 'info' && 'border-blue-400/40',
          )}
        >
          <span className="mt-0.5 flex-shrink-0">
            {t.type === 'success' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
            {t.type === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
            {t.type === 'warning' && <AlertTriangle className="h-4 w-4 text-orange-400" />}
            {t.type === 'info' && <Info className="h-4 w-4 text-blue-400" />}
          </span>
          <p className="flex-1 text-sm">{t.message}</p>
          <button
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            className="text-muted-foreground hover:text-foreground ml-1"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
