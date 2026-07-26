import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Panneau latéral (slide-over) — alternative légère au dialog plein écran pour une vue rapide. */
export function SlideOver({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-200" onClick={onClose} />
      <div
        className={cn(
          'relative h-full w-full max-w-md bg-background border-l shadow-xl overflow-y-auto animate-in slide-in-from-right duration-300',
          className,
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 backdrop-blur px-4 h-14">
          <h2 className="font-semibold text-sm truncate">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
