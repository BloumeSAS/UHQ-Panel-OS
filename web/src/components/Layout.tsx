import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  LayoutDashboard,
  Users,
  Server,
  ScrollText,
  Settings,
  Network,
  Radar,
  Info,
  Menu,
  X,
  Moon,
  Sun,
  LogOut,
  Globe,
  BarChart3,
  BookOpen,
  ExternalLink,
  Activity,
  Puzzle,
  Bell,
  ShieldCheck,
  KeyRound,
  ClipboardList,
  UserPlus,
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useSite } from '@/lib/site';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Button } from '@/components/ui';
import { Footer } from '@/components/Footer';
import { AddonTopbarSlots, TopbarSlotItem } from '@/components/AddonTopbarSlots';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { status } = useSite();
  const { t, lang, setLang, languages, mergeAddonTranslations } = useI18n();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: addons } = useQuery({
    queryKey: ['addons'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/addons');
        return data.data as any[];
      } catch {
        return [];
      }
    },
    enabled: !!user,
  });

  // Notifications
  const { data: notifData } = useQuery({
    queryKey: ['notifications-count'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/notifications/unread-count');
        return data.count as number;
      } catch {
        return 0;
      }
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/notifications');
        return data.data as any[];
      } catch {
        return [];
      }
    },
    enabled: notifOpen && !!user,
  });

  const markReadMutation = useMutation({
    mutationFn: () => api.post('/notifications/mark-read'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Close notif panel on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const adminNav: NavItem[] = [
    { to: '/', label: t('nav.dashboard'), icon: LayoutDashboard },
    { to: '/subusers', label: t('nav.subusers'), icon: Network },
    { to: '/users', label: t('nav.users'), icon: Users },
    { to: '/pool', label: t('nav.pool'), icon: Server },
    { to: '/scraper', label: t('nav.scraper'), icon: Radar },
    { to: '/checker', label: t('nav.checker'), icon: Activity },
    { to: '/logs', label: t('nav.logs'), icon: ScrollText },
    { to: '/reports', label: t('nav.reports'), icon: BarChart3 },
    { to: '/audit', label: t('nav.audit'), icon: ClipboardList },
    { to: '/addons-manage', label: t('nav.addons'), icon: Puzzle },
    { to: '/addon-docs', label: t('nav.addonDocs'), icon: BookOpen },
    { to: '/settings', label: t('nav.settings'), icon: Settings },
    { to: '/about', label: t('nav.about'), icon: Info },
  ];
  const userNav: NavItem[] = [
    { to: '/', label: t('nav.myProxies'), icon: Network },
    { to: '/security', label: t('nav.security'), icon: ShieldCheck },
    { to: '/api-keys', label: t('nav.apiKeys'), icon: KeyRound },
    { to: '/about', label: t('nav.about'), icon: Info },
  ];

  // ─── Fusion des traductions d'addons au runtime ───────────────────────────
  useEffect(() => {
    if (!addons) return;
    const merged: Record<string, Record<string, string>> = {};
    for (const a of addons as any[]) {
      const translations = (a as any).manifest?.translations ?? {};
      for (const [l, dict] of Object.entries(translations as Record<string, Record<string, string>>)) {
        if (!merged[l]) merged[l] = {};
        Object.assign(merged[l], dict);
      }
    }
    mergeAddonTranslations(merged);
  }, [addons, mergeAddonTranslations]);

  // ─── Addons externes : nav items générés depuis le manifest ──────────────
  const addonNav: NavItem[] = (addons ?? [])
    .filter((a: any) => a.enabled && a.manifest)
    .flatMap((a: any) => {
      const pages: any[] = a.manifest?.pages ?? [];
      const isAdmin = user?.role === 'ADMIN';
      return pages
        .filter((p: any) => p.showInNavbar !== false && (!p.adminOnly || isAdmin))
        .map((p: any) => {
          const IconComponent = (LucideIcons as any)[p.icon ?? a.manifest?.icon ?? 'Puzzle'];
          return {
            to: `/addons/${a.id}/${encodeURIComponent(p.path)}`,
            label: t(p.label),
            icon: IconComponent || Puzzle,
          };
        });
    });

  // ─── Slots topbar : items injectés dans le dropdown en haut à droite ────────
  const addonTopbarSlots: TopbarSlotItem[] = (addons ?? [])
    .filter((a: any) => a.enabled && a.manifest)
    .flatMap((a: any) => {
      const slots: any[] = a.manifest?.slots ?? [];
      const isAdmin = user?.role === 'ADMIN';
      return slots
        .filter((s: any) => s.zone === 'topbar' && (!s.adminOnly || isAdmin))
        .map((s: any) => {
          let label = t(s.label);
          if (label === s.label) {
            const tr = a.manifest?.translations ?? {};
            label = tr[lang]?.[s.label] ?? tr['fr']?.[s.label] ?? tr['en']?.[s.label] ?? s.label;
          }
          return {
            label,
            icon:      s.icon,
            to:        `/addons/${a.id}/${encodeURIComponent(s.page)}`,
            addonName: a.manifest?.name ?? 'Addon',
          };
        });
    });

  const baseNav = user?.role === 'ADMIN' ? adminNav : userNav;
  const nav = [...baseNav];
  if (addonNav.length > 0) {
    const insertAt = nav.findIndex((item) => item.to === '/settings' || item.to === '/about');
    if (insertAt !== -1) nav.splice(insertAt, 0, ...addonNav);
    else nav.push(...addonNav);
  }

  // Admin-only nav additions for non-sidebar items
  const adminHeaderNav = user?.role === 'ADMIN' ? [
    { to: '/security', label: t('nav.security'), icon: ShieldCheck },
    { to: '/api-keys', label: t('nav.apiKeys'), icon: KeyRound },
  ] : [];

  const unreadCount = notifData ?? 0;

  const notifTypeIcon = (type: string) => {
    switch (type) {
      case 'error': return '🔴';
      case 'warning': return '🟠';
      case 'success': return '🟢';
      default: return '🔵';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 transform border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
          <img src={status?.logoUrl || '/static/logo.png'} alt="logo" className="h-8 w-8 rounded" />
          <span className="truncate text-sm font-semibold">{status?.siteName || 'UHQ Panel OS'}</span>
        </div>
        <nav className="flex flex-col gap-1 p-3 overflow-y-auto max-h-[calc(100vh-4rem)]">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-primary text-primary-foreground'
                    : 'hover:bg-sidebar-accent',
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
          {user && (
            <a
              href={`/docs?token=${localStorage.getItem('uhq_token') || ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent"
              onClick={() => setOpen(false)}
            >
              <BookOpen className="h-4 w-4" />
              <span className="flex-1">{t('nav.docs')}</span>
              <ExternalLink className="h-3 w-3 opacity-50" />
            </a>
          )}
        </nav>
      </aside>

      {/* Overlay mobile */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className="md:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(!open)}>
            {open ? <X /> : <Menu />}
          </Button>
          <div className="flex flex-1 items-center justify-end gap-2">
            <div className="relative">
              <select
                aria-label="Langue"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="h-9 rounded-md border border-input bg-background pl-8 pr-2 text-sm"
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.nativeName}
                  </option>
                ))}
              </select>
              <Globe className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            </div>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Thème">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            {/* Notification Bell */}
            <div ref={notifRef} className="relative">
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('notifications.title')}
                onClick={() => {
                  setNotifOpen((v) => !v);
                  if (!notifOpen && unreadCount > 0) {
                    markReadMutation.mutate();
                  }
                }}
                className="relative"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Button>
              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border bg-popover shadow-xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between border-b px-4 py-3">
                    <span className="font-semibold text-sm">{t('notifications.title')}</span>
                    <button
                      onClick={() => markReadMutation.mutate()}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {t('notifications.markAllRead')}
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-border">
                    {!notifications?.length && (
                      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                        {t('notifications.empty')}
                      </p>
                    )}
                    {notifications?.map((n: any) => (
                      <div
                        key={n.id}
                        className={cn(
                          'px-4 py-3 text-sm transition-colors',
                          !n.read && 'bg-accent/40',
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 text-base">{notifTypeIcon(n.type)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{n.title}</p>
                            <p className="text-muted-foreground text-xs truncate">{n.message}</p>
                            <p className="text-muted-foreground text-xs mt-1">
                              {new Date(n.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <AddonTopbarSlots
              slots={addonTopbarSlots}
              email={user?.email}
              role={user?.role}
            />
            <Button variant="ghost" size="icon" onClick={() => { logout(); navigate('/login'); }} aria-label={t('logout')}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="p-4 md:p-6">{children}</main>

        <Footer />
      </div>
    </div>
  );
}
