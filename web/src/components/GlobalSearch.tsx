import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, CornerDownLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
}

interface ResultItem {
  key: string;
  label: string;
  sub?: string;
  to: string;
  icon: React.ElementType;
}

/** Palette de commandes Cmd/Ctrl+K : navigation + recherche sous-users/users (admin). */
export function GlobalSearch({ nav }: { nav: NavItem[] }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const isAdmin = user?.role === 'ADMIN';

  const { data: subUsers } = useQuery({
    queryKey: ['global-search-subusers'],
    queryFn: async () => (await api.get('/subusers')).data.data as { id: string; username: string; label: string }[],
    enabled: open && isAdmin,
    staleTime: 30000,
  });
  const { data: users } = useQuery({
    queryKey: ['global-search-users'],
    queryFn: async () => (await api.get('/users')).data.data as { id: string; email: string; role: string }[],
    enabled: open && isAdmin,
    staleTime: 30000,
  });

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const results = useMemo<ResultItem[]>(() => {
    const q = query.trim().toLowerCase();
    const navResults: ResultItem[] = nav
      .filter((n) => !q || n.label.toLowerCase().includes(q))
      .map((n) => ({ key: `nav:${n.to}`, label: n.label, to: n.to, icon: n.icon }));

    if (!q) return navResults.slice(0, 8);

    const subResults: ResultItem[] = (subUsers ?? [])
      .filter((s) => s.username.toLowerCase().includes(q) || s.label?.toLowerCase().includes(q))
      .slice(0, 6)
      .map((s) => ({ key: `sub:${s.id}`, label: s.label || s.username, sub: s.username, to: '/subusers', icon: Search }));

    const userResults: ResultItem[] = (users ?? [])
      .filter((u) => u.email.toLowerCase().includes(q))
      .slice(0, 6)
      .map((u) => ({ key: `user:${u.id}`, label: u.email, sub: u.role, to: '/users', icon: Search }));

    return [...navResults, ...subResults, ...userResults].slice(0, 20);
  }, [query, nav, subUsers, users]);

  const go = (item: ResultItem) => {
    navigate(item.to);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 h-9 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
        aria-label="Recherche globale"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Rechercher…</span>
        <kbd className="ml-2 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">Ctrl K</kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-lg rounded-lg border bg-popover shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
              if (e.key === 'Enter' && results[activeIndex]) go(results[activeIndex]);
            }}
            placeholder="Aller à une page, un sous-user, un utilisateur…"
            className="flex-1 h-12 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {!results.length && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun résultat</p>
          )}
          {results.map((item, i) => (
            <button
              key={item.key}
              onClick={() => go(item)}
              onMouseEnter={() => setActiveIndex(i)}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-2 text-sm text-left',
                i === activeIndex ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50',
              )}
            >
              <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.sub && <span className="text-xs text-muted-foreground truncate">{item.sub}</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-end gap-1 border-t px-3 py-1.5 text-[10px] text-muted-foreground">
          <CornerDownLeft className="h-3 w-3" /> pour ouvrir · Échap pour fermer
        </div>
      </div>
    </div>
  );
}
