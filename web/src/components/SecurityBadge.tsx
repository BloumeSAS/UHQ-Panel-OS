import { Fingerprint } from 'lucide-react';
import { useSite } from '@/lib/site';
import { useT } from '@/lib/i18n';

/** « Protégé par BloumeID » sous les formulaires quand l'addon Sécurité est actif (réglable dans l'addon). */
export function SecurityBadge() {
  const { status } = useSite();
  const t = useT();
  const s = status?.security;
  if (!s?.badge || !(s.login || s.register || s.forgot)) return null;
  return (
    <a href="https://github.com/BloumeSAS/BloumeID" target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
      <Fingerprint className="h-3.5 w-3.5" />
      {t('security.badge')} <span className="font-semibold">BloumeID</span>
    </a>
  );
}
