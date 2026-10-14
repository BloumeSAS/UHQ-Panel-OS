import { useState } from 'react';
import { ClipboardCopy, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/dialog';

/** « Copier les infos de support » : version, diagnostic, réglages sans secret et dernières erreurs masquées, à coller dans une demande d'aide. */
export function SupportInfoButton({ className }: { className?: string }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.get('/system/support-info', { timeout: 60000 });
      const text: string = data.text;
      try {
        await navigator.clipboard.writeText(text);
        toast.success(t('support.copied'));
      } catch {
        setPreview(text); // presse-papiers refusé : on affiche le texte à copier à la main
      }
    } catch {
      toast.error(t('support.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={run} disabled={busy} className={className} title={t('support.hint')}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardCopy className="mr-2 h-4 w-4" />}
        {t('support.btn')}
      </Button>
      <Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('support.btn')}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{t('support.manual')}</p>
          <textarea readOnly value={preview ?? ''} onFocus={(e) => e.currentTarget.select()} className="h-80 w-full rounded-md border bg-muted/30 p-3 font-mono text-xs" />
        </DialogContent>
      </Dialog>
    </>
  );
}
