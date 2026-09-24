import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

/**
 * Rendu Markdown léger, stylé aux couleurs du thème (clair/sombre) — pas de
 * plugin Tailwind Typography, juste des classes utilitaires par élément pour
 * rester cohérent avec le reste du panel. Utilisé pour les notes de version
 * GitHub (About → historique) et tout futur contenu Markdown venant d'une
 * source externe (jamais de HTML brut — react-markdown échappe par défaut).
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('space-y-2 text-sm leading-relaxed text-muted-foreground', className)}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h3 className="text-base font-semibold text-foreground mt-3 first:mt-0">{children}</h3>,
          h2: ({ children }) => <h4 className="text-sm font-semibold text-foreground mt-3 first:mt-0">{children}</h4>,
          h3: ({ children }) => <h5 className="text-sm font-medium text-foreground mt-2 first:mt-0">{children}</h5>,
          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          code: ({ children }) => (
            <code className="rounded bg-accent px-1 py-0.5 font-mono text-[11px] text-foreground">{children}</code>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-3 italic">{children}</blockquote>
          ),
          hr: () => <hr className="border-border" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
