import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/lib/theme';

/** Conteneur de notifications (shadcn/ui + sonner), thémé sur les CSS vars du panel. */
export function Toaster() {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        // `richColors` donne déjà le fond/texte coloré par type (succès,
        // erreur...) — on ne touche que forme/ombre pour rester cohérent
        // avec le reste du panel, sans écraser ces couleurs.
        classNames: {
          toast: 'rounded-xl border shadow-lg',
          title: 'text-sm font-medium',
          description: 'text-sm',
        },
      }}
    />
  );
}
