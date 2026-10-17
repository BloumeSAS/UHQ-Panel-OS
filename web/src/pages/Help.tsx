import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, ChevronDown, LifeBuoy, PlayCircle, Search } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { useTour } from '@/components/GuidedTour';
import { SupportInfoButton } from '@/components/SupportInfoButton';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

type Audience = 'all' | 'staff';
/** Les questions de l'aide : textes dans `faq.<id>.q|a` (feat-fr/en.ts). `route` = page à ouvrir (si accessible). */
const FAQ: { id: number; route?: string; audience: Audience }[] = [
  { id: 1, route: '/subusers', audience: 'all' },
  { id: 2, audience: 'all' },
  { id: 3, route: '/subusers', audience: 'all' },
  { id: 4, route: '/proxy-pools', audience: 'all' },
  { id: 5, audience: 'all' },
  { id: 6, route: '/pool', audience: 'staff' },
  { id: 7, route: '/diagnostics', audience: 'staff' },
  { id: 8, route: '/diagnostics', audience: 'staff' },
  { id: 9, route: '/about', audience: 'staff' },
  { id: 10, route: '/settings?tab=backups', audience: 'staff' },
  { id: 11, route: '/security', audience: 'all' },
  { id: 12, route: '/settings?tab=webhooks', audience: 'staff' },
  { id: 13, route: '/proxy-pools', audience: 'staff' },
  { id: 14, route: '/users', audience: 'staff' },
  { id: 15, route: '/', audience: 'staff' },
  { id: 16, route: '/logs', audience: 'staff' },
  { id: 17, route: '/settings?tab=theme', audience: 'staff' },
  { id: 18, route: '/diagnostics', audience: 'staff' },
];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const DOCS_URL = 'https://uhq-panel-os-docs.bloume.fr/';

/** Centre d'aide : questions fréquentes avec recherche, lien vers la page concernée, visite guidée, infos de support. */
export default function Help() {
  const t = useT();
  const { user } = useAuth();
  const { start, categories } = useTour();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [open, setOpen] = useState<number | null>(null);
  const isStaff = user?.role === 'ADMIN' || user?.role === 'SUPPORT';
  const isAdmin = user?.role === 'ADMIN';

  const items = useMemo(() => {
    const words = norm(query).split(/\s+/).filter(Boolean);
    return FAQ.filter((f) => f.audience === 'all' || isStaff)
      .map((f) => ({ ...f, q: t(`faq.${f.id}.q`), a: t(`faq.${f.id}.a`) }))
      .filter((f) => {
        if (!words.length) return true;
        const hay = norm(`${f.q} ${f.a}`);
        return words.every((w) => hay.includes(w));
      });
  }, [query, isStaff, t]);

  // Un lien n'est proposé que si la page est accessible avec le rôle courant.
  const canOpen = (route?: string) => {
    if (!route) return false;
    const path = route.split('?')[0];
    if (isAdmin) return true;
    if (isStaff) return ['/', '/pool', '/logs', '/about', '/security', '/diagnostics-none'].includes(path);
    return path === '/security';
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <LifeBuoy className="h-6 w-6 text-primary" />
          {t('help.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('help.subtitle')}</p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('help.search')}
          className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          autoFocus
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <BookOpen className="h-4 w-4" />
          {t('help.docs')}
        </a>
        <Button type="button" variant="outline" onClick={() => start()}>
          <PlayCircle className="mr-2 h-4 w-4" />
          {t('help.tour')}
        </Button>
      </div>

      {categories.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{t('tour.menu.title')}</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((c) => (
              <button key={c.id} type="button" onClick={() => start(c.id)} className="flex items-start gap-2.5 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/60 hover:bg-accent">
                <span className="text-lg leading-none">{t(`tour.cat.${c.id}.i`)}</span>
                <span><span className="block text-sm font-medium">{t(`tour.cat.${c.id}.t`)}</span><span className="block text-xs text-muted-foreground">{t(`tour.cat.${c.id}.d`)}</span></span>
              </button>
            ))}
          </div>
        </section>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t('help.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((f) => {
            const isOpen = open === f.id || (!!query && items.length <= 3);
            return (
              <li key={f.id} className="rounded-xl border">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen && open === f.id ? null : f.id)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left text-sm font-medium"
                  aria-expanded={isOpen}
                >
                  {f.q}
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition', isOpen && 'rotate-180')} />
                </button>
                {isOpen && (
                  <div className="space-y-2 border-t px-4 pb-4 pt-3 text-sm text-muted-foreground">
                    <p className="leading-relaxed">{f.a}</p>
                    {canOpen(f.route) && f.route && (
                      <Link to={f.route} className="inline-block font-medium text-primary hover:underline">
                        {t('help.open')} →
                      </Link>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isAdmin && (
        <div className="rounded-xl border bg-muted/30 p-4">
          <p className="text-sm font-semibold">{t('help.stillStuck')}</p>
          <p className="mb-3 mt-1 text-sm text-muted-foreground">{t('help.stillStuckB')}</p>
          <SupportInfoButton />
        </div>
      )}
    </div>
  );
}
