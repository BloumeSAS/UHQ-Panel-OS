import { cn } from '@/lib/utils';

/**
 * Drapeaux emoji (indicateurs régionaux Unicode) ne rendent PAS sur Windows —
 * Chrome/Edge/Firefox y affichent le code pays en texte brut faute de police
 * système avec ces glyphes (contrairement à macOS/Android/iOS). On utilise donc
 * de petites images (flagcdn.com) qui rendent pareil sur toutes les plateformes.
 */
export function flagImageUrl(countryCode: string, width: 20 | 24 | 40 = 20): string | null {
  const code = countryCode.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) return null;
  return `https://flagcdn.com/w${width}/${code}.png`;
}

export function CountryFlag({ code, className }: { code: string; className?: string }) {
  const url = flagImageUrl(code);
  if (!url) return <span className={className}>🌐</span>;
  return (
    <img
      src={url}
      alt={code.trim().toUpperCase()}
      title={code.trim().toUpperCase()}
      loading="lazy"
      className={cn('inline-block h-3.5 w-5 rounded-sm object-cover align-middle', className)}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
      }}
    />
  );
}
