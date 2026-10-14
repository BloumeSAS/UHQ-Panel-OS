import { Link } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui';

/** État vide guidé : explique quoi faire ensuite (et propose éventuellement une action). */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  helpQuery,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
  /** Renvoie vers l'aide avec cette recherche pré-remplie. */
  helpQuery?: string;
}) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
      <div className="rounded-full bg-primary/10 p-3 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="max-w-xl text-sm text-muted-foreground">{body}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {action && (
          <Button type="button" variant="outline" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
        {helpQuery !== undefined && (
          <Link
            to={`/help?q=${encodeURIComponent(helpQuery)}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-primary hover:underline"
          >
            <LifeBuoy className="h-3.5 w-3.5" />
            {t('empty.help')}
          </Link>
        )}
      </div>
    </div>
  );
}
