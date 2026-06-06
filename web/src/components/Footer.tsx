import { Moon, Sun } from 'lucide-react';
import { useSite } from '@/lib/site';
import { useTheme } from '@/lib/theme';
import { useT } from '@/lib/i18n';

/**
 * Footer global : marque cliquable « UHQ Panel OS by Bloume.fr » (→ bloume.fr),
 * version, et bouton de bascule du thème clair/sombre.
 */
export function Footer({ className = '' }: { className?: string }) {
  const { status } = useSite();
  const { theme, toggle } = useTheme();
  const t = useT();

  return (
    <footer
      className={
        'flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-6 py-4 text-center text-xs text-muted-foreground ' +
        className
      }
    >
      <a
        href="https://bloume.fr"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 font-medium text-foreground transition-colors hover:text-primary"
      >
        {status?.logoUrl && (
          <img src={status.logoUrl} alt="Logo" className="h-3.5 w-3.5 object-contain" />
        )}
        <span>{status?.siteName || 'UHQ Panel OS by Bloume.fr'}</span>
      </a>
      {status?.version && (
        <>
          <span className="text-muted-foreground/60">·</span>
          <span>v{status.version}</span>
        </>
      )}
      <span className="text-muted-foreground/60">·</span>
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-label={t('common.toggleTheme')}
      >
        {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        {theme === 'dark' ? t('common.light') : t('common.dark')}
      </button>
    </footer>
  );
}
