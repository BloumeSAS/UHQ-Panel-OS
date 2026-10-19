import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { useSite } from '@/lib/site';

/**
 * Page d'accueil publique (addon Vitrine) : affichée sur « / » aux visiteurs NON connectés, quand l'addon est actif.
 * L'addon est servi par le panel sous /addon-proxy/vitrine/ (même origine) ; ses liens de connexion ouvrent le panel en pleine page.
 */
export default function VitrineHome() {
  const { lang } = useI18n();
  const { theme } = useTheme();
  const { status } = useSite();
  const [ready, setReady] = useState(false);
  const src = `/addon-proxy/vitrine/?lang=${encodeURIComponent(lang)}&theme=${theme === 'dark' ? 'dark' : 'light'}`;
  return (
    <div className="fixed inset-0 bg-background">
      {!ready && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">{status?.siteName || '…'}</div>}
      <iframe title={status?.siteName || 'Vitrine'} src={src} onLoad={() => setReady(true)} className="h-full w-full border-0" />
    </div>
  );
}
