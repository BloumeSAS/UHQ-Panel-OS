import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ClipboardCopy, Search, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { Badge, Button } from '@/components/ui';
import { cn } from '@/lib/utils';

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

/** Fiche des erreurs que le moteur renvoie aux clients : ce que chaque code veut dire, quoi faire, quoi répondre. */
export default function ErrorCodes() {
  const { t, lang } = useI18n();
  const l: 'fr' | 'en' = lang === 'fr' ? 'fr' : 'en';
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['error-catalog'],
    queryFn: async () => (await api.get('/monitoring/error-catalog')).data.data as ErrorInfo[],
    staleTime: 3600_000,
  });

  const items = useMemo(() => {
    const words = norm(query).split(/\s+/).filter(Boolean);
    return data.filter((e) => {
      if (!words.length) return true;
      const hay = norm(`${e.code} ${e.status} ${e.title[l]} ${e.causes[l]} ${e.customer[l]}`);
      return words.every((w) => hay.includes(w));
    });
  }, [data, query, l]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('errors.copied'));
    } catch {
      toast.error(t('common.error'));
    }
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

      <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p>{t('errors.rule')}</p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-background p-3 text-xs">{`HTTP/1.1 502 Bad Gateway
X-UHQ-Error: UHQ_NO_UPSTREAM
Content-Type: application/json

{"error":{"code":"UHQ_NO_UPSTREAM","status":502,"message":"…"}}`}</pre>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('errors.search')}
          className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {isLoading ? null : items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t('errors.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((e) => {
            const isOpen = open === e.code || (!!query && items.length <= 2);
            return (
              <li key={e.code} className="rounded-xl border">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen && open === e.code ? null : e.code)}
                  className="flex w-full items-center gap-3 p-4 text-left"
                  aria-expanded={isOpen}
                >
                  <Badge variant="secondary" className="shrink-0 font-mono">
                    {e.status}
                  </Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{e.title[l]}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{e.code}</span>
                  </span>
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition', isOpen && 'rotate-180')} />
                </button>
                {isOpen && (
                  <div className="space-y-3 border-t px-4 pb-4 pt-3 text-sm">
                    <Section title={t('errors.causes')}>{e.causes[l]}</Section>
                    <Section title={t('errors.action')}>{e.action[l]}</Section>
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('errors.customer')}</p>
                      <p className="leading-relaxed">{e.customer[l]}</p>
                      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => copy(e.customer[l])}>
                        <ClipboardCopy className="mr-2 h-3.5 w-3.5" />
                        {t('errors.copy')}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
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
