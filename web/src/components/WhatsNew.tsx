import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/dialog';
import { Markdown } from '@/components/Markdown';

const SEEN_KEY = 'uhq_seen_version';

interface Release {
  tag: string;
  name: string;
  body: string;
  publishedAt: string;
}

const parts = (v: string) => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
const cmp = (a: string, b: string) => {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};

/**
 * Fenêtre « Nouveautés » : après une mise à jour du panel, présente les notes des versions installées depuis la
 * dernière visite (admins). Premier affichage sur un navigateur : on mémorise la version sans rien montrer.
 */
export function WhatsNew() {
  const t = useT();
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [current, setCurrent] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/about');
        const cur: string = data?.data?.version;
        if (!cur || cancelled) return;
        let seen: string | null = null;
        try {
          seen = localStorage.getItem(SEEN_KEY);
        } catch {
          /* ignore */
        }
        if (!seen) {
          try {
            localStorage.setItem(SEEN_KEY, cur);
          } catch {
            /* ignore */
          }
          return;
        }
        if (cmp(cur, seen) <= 0) return;
        const { data: rel } = await api.get('/about/releases');
        const list = ((rel?.data ?? []) as Release[])
          .filter((r) => !r.tag.includes('rc') && cmp(r.tag, seen!) > 0 && cmp(r.tag, cur) <= 0)
          .sort((a, b) => cmp(b.tag, a.tag))
          .slice(0, 5);
        if (cancelled) return;
        setCurrent(cur);
        if (list.length) setReleases(list);
        else {
          try {
            localStorage.setItem(SEEN_KEY, cur);
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* hors ligne / GitHub injoignable : rien à montrer */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, current);
    } catch {
      /* ignore */
    }
    setReleases(null);
  };

  return (
    <Dialog open={!!releases} onOpenChange={(o) => !o && close()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t('whatsnew.title').replace('{v}', current)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {releases?.map((r) => (
            <section key={r.tag}>
              <h3 className="font-mono text-sm font-semibold text-primary">{r.name || r.tag}</h3>
              <Markdown className="mt-1 min-w-0 break-words text-sm">{r.body}</Markdown>
            </section>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <Link to="/about" onClick={close} className="text-xs font-medium text-primary hover:underline">
            {t('whatsnew.all')}
          </Link>
          <Button onClick={close}>{t('whatsnew.ok')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
