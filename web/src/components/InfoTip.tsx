import { HelpCircle } from 'lucide-react';

/** Petite infobulle « ? » (survol ou focus clavier) à placer à côté d'un libellé de formulaire. */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" tabIndex={0} aria-label={text} className="ml-1 text-muted-foreground hover:text-foreground focus:text-foreground focus:outline-none">
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-1.5 w-60 -translate-x-1/2 rounded-md border bg-popover p-2 text-left text-xs font-normal text-popover-foreground opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
