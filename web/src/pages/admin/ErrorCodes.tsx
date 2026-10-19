import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ClipboardCopy, Globe2, Search, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { Badge, Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { HTTP_CODES, WHY_DIFFERENT, type Family, type Origin } from '@/lib/httpCodes';

interface Text {
  fr: string;
  en: string;
}
interface ErrorInfo {
  code: string;
  status: number;
  title: Text;
  message: Text;
  causes: Text;
  action: Text;
  customer: Text;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const LABELS = {
  fr: {
    tabPanel: 'Erreurs du panel',
    tabHttp: 'Codes HTTP des sites',
    httpTitle: 'Codes HTTP vus par vos clients',
    httpIntro: 'Ces codes ne viennent PAS du panel : ils sont renvoyés par le site visité (ou son CDN) et le proxy les transmet tels quels. Un client peut donc voir un 303 que vous ne voyez pas en testant « la même chose ».',
    how: 'Comment savoir d’où vient le code ?',
    howText: 'Regardez les en-têtes de la réponse : si X-UHQ-Error est présent, c’est le panel (onglet « Erreurs du panel »). S’il est absent, c’est le site de destination (ou son CDN).',
    whyTitle: 'Pourquoi le client voit une erreur que vous ne voyez pas ?',
    all: 'Tous',
    families: { '2xx': '2xx · Succès', '3xx': '3xx · Redirections', '4xx': '4xx · Erreurs client', '5xx': '5xx · Erreurs serveur' },
    origin: { site: 'Site visité', cdn: 'CDN / Cloudflare', panel: 'Panel' },
    meaning: 'Ce que ça veut dire',
    why: 'Pourquoi le client le voit',
    action: 'Que faire',
    search: 'Rechercher un code (303, redirection, cloudflare…)',
  },
  en: {
    tabPanel: 'Panel errors',
    tabHttp: 'Website HTTP codes',
    httpTitle: 'HTTP codes your customers may see',
    httpIntro: 'These codes do NOT come from the panel: they are returned by the visited site (or its CDN) and the proxy passes them through unchanged. A customer can therefore see a 303 that you do not see when testing “the same thing”.',
    how: 'How to tell where a code comes from?',
    howText: 'Look at the response headers: if X-UHQ-Error is present, it is the panel (“Panel errors” tab). If it is absent, it is the destination site (or its CDN).',
    whyTitle: 'Why does the customer see an error you do not?',
    all: 'All',
    families: { '2xx': '2xx · Success', '3xx': '3xx · Redirects', '4xx': '4xx · Client errors', '5xx': '5xx · Server errors' },
    origin: { site: 'Visited site', cdn: 'CDN / Cloudflare', panel: 'Panel' },
    meaning: 'What it means',
    why: 'Why the customer sees it',
    action: 'What to do',
    search: 'Search a code (303, redirect, cloudflare…)',
  },
} as const;

const ORIGIN_CLS: Record<Origin, string> = {
  site: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  cdn: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  panel: 'bg-primary/10 text-primary',
};

/** Fiche des erreurs que les clients peuvent voir : celles du moteur (UHQ_*) et les codes HTTP renvoyés par les sites visités. */
export default function ErrorCodes() {
  const { t, lang } = useI18n();
  const l: 'fr' | 'en' = lang === 'fr' ? 'fr' : 'en';
  const L = LABELS[l];
  const [tab, setTab] = useState<'panel' | 'http'>('panel');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [family, setFamily] = useState<Family | 'all'>('all');

  const { data = [], isLoading } = useQuery({
    queryKey: ['error-catalog'],
    queryFn: async () => (await api.get('/monitoring/error-catalog')).data.data as ErrorInfo[],
    staleTime: 3600_000,
  });

  const words = useMemo(() => norm(query).split(/\s+/).filter(Boolean), [query]);

  const items = useMemo(
    () =>
      data.filter((e) => {
        if (!words.length) return true;
        const hay = norm(`${e.code} ${e.status} ${e.title[l]} ${e.causes[l]} ${e.customer[l]}`);
        return words.every((w) => hay.includes(w));
      }),
    [data, words, l],
  );

  const httpItems = useMemo(
    () =>
      HTTP_CODES.filter((c) => {
        if (family !== 'all' && c.family !== family) return false;
        if (!words.length) return true;
        const hay = norm(`${c.status} ${c.title[l]} ${c.meaning[l]} ${c.why[l]} ${c.customer[l]} ${L.origin[c.origin]}`);
        return words.every((w) => hay.includes(w));
      }),
    [words, l, family, L],
  );

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('errors.copied'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  const switchTab = (next: 'panel' | 'http') => {
    setTab(next);
    setOpen(null);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldAlert className="h-6 w-6 text-primary" />
          {t('errors.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('errors.subtitle')}</p>
      </div>

      <div className="inline-flex rounded-lg border p-1" role="tablist">
        <TabBtn active={tab === 'panel'} onClick={() => switchTab('panel')} icon={<ShieldAlert className="h-4 w-4" />}>{L.tabPanel}</TabBtn>
        <TabBtn active={tab === 'http'} onClick={() => switchTab('http')} icon={<Globe2 className="h-4 w-4" />}>{L.tabHttp}</TabBtn>
      </div>

      {tab === 'panel' && (
        <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
          <p>{t('errors.rule')}</p>
          <pre className="mt-3 overflow-x-auto rounded-md bg-background p-3 text-xs">{`HTTP/1.1 502 Bad Gateway
X-UHQ-Error: UHQ_NO_UPSTREAM
Content-Type: application/json

{"error":{"code":"UHQ_NO_UPSTREAM","status":502,"message":"…"}}`}</pre>
        </div>
      )}

      {tab === 'http' && (
        <div className="space-y-3">
          <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{L.httpTitle}</p>
            <p className="mt-1">{L.httpIntro}</p>
            <p className="mt-3 font-medium text-foreground">{L.how}</p>
            <p className="mt-1">{L.howText}</p>
          </div>
          <details className="rounded-xl border p-4 text-sm">
            <summary className="cursor-pointer font-medium">{L.whyTitle}</summary>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
              {WHY_DIFFERENT[l].map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </details>
          <div className="flex flex-wrap gap-2">
            {(['all', '2xx', '3xx', '4xx', '5xx'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFamily(f)}
                className={cn('rounded-full border px-3 py-1 text-xs font-medium transition', family === f ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}
              >
                {f === 'all' ? L.all : L.families[f]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === 'http' ? L.search : t('errors.search')}
          className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {tab === 'panel' &&
        (isLoading ? null : items.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t('errors.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {items.map((e) => {
              const isOpen = open === e.code || (!!query && items.length <= 2);
              return (
                <li key={e.code} className="rounded-xl border">
                  <Row open={isOpen} onToggle={() => setOpen(isOpen && open === e.code ? null : e.code)} status={e.status} title={e.title[l]} sub={e.code}>
                    <Section title={t('errors.causes')}>{e.causes[l]}</Section>
                    <Section title={t('errors.action')}>{e.action[l]}</Section>
                    <Customer text={e.customer[l]} label={t('errors.customer')} copyLabel={t('errors.copy')} onCopy={copy} />
                  </Row>
                </li>
              );
            })}
          </ul>
        ))}

      {tab === 'http' &&
        (httpItems.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t('errors.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {httpItems.map((c) => {
              const key = `http-${c.status}`;
              const isOpen = open === key || (!!query && httpItems.length <= 2);
              return (
                <li key={key} className="rounded-xl border">
                  <Row
                    open={isOpen}
                    onToggle={() => setOpen(isOpen && open === key ? null : key)}
                    status={c.status}
                    title={c.title[l]}
                    badge={<span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', ORIGIN_CLS[c.origin])}>{L.origin[c.origin]}</span>}
                  >
                    <Section title={L.meaning}>{c.meaning[l]}</Section>
                    <Section title={L.why}>{c.why[l]}</Section>
                    <Section title={L.action}>{c.action[l]}</Section>
                    <Customer text={c.customer[l]} label={t('errors.customer')} copyLabel={t('errors.copy')} onCopy={copy} />
                  </Row>
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn('flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition', active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
    >
      {icon}
      {children}
    </button>
  );
}

function Row({
  open, onToggle, status, title, sub, badge, children,
}: {
  open: boolean;
  onToggle: () => void;
  status: number;
  title: string;
  sub?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left" aria-expanded={open}>
        <Badge variant="secondary" className="shrink-0 font-mono">
          {status}
        </Badge>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{title}</span>
            {badge}
          </span>
          {sub && <span className="block truncate font-mono text-[11px] text-muted-foreground">{sub}</span>}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition', open && 'rotate-180')} />
      </button>
      {open && <div className="space-y-3 border-t px-4 pb-4 pt-3 text-sm">{children}</div>}
    </>
  );
}

function Customer({ text, label, copyLabel, onCopy }: { text: string; label: string; copyLabel: string; onCopy: (s: string) => void }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="leading-relaxed">{text}</p>
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => onCopy(text)}>
        <ClipboardCopy className="mr-2 h-3.5 w-3.5" />
        {copyLabel}
      </Button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
