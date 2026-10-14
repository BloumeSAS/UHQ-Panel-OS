/**
 * Étapes de la visite guidée. Les textes sont dans lib/i18n/tour-{fr,en}.ts
 * (`tour.<id>.t` titre, `tour.<id>.b` texte). Les éléments mis en lumière sont
 * repérés par l'attribut `data-tour="<valeur>"` posé dans Layout / Settings.
 */
export type TourAudience = 'admin' | 'staff' | 'user' | 'all';

export interface TourStep {
  id: string;
  /** Qui voit l'étape : admin = ADMIN ; staff = ADMIN + SUPPORT ; user = USER ; all = tous. */
  audience: TourAudience;
  /** Page à ouvrir avant d'afficher l'étape. */
  route?: string;
  /** Élément principal mis en lumière (`data-tour`). */
  focus?: string;
  /** Second élément mis en lumière (en général le lien du menu / l'onglet). */
  nav?: string;
  /** Onglet des Paramètres à ouvrir. */
  settingsTab?: string;
}

const page = (id: string, audience: TourAudience, route: string): TourStep => ({
  id,
  audience,
  route,
  focus: 'content',
  nav: `nav:${route}`,
});

const settingsTab = (key: string): TourStep => ({
  id: `s_${key}`,
  audience: 'admin',
  route: '/settings',
  focus: 'content',
  nav: `settings-tab:${key}`,
  settingsTab: key,
});

export const TOUR_STEPS: TourStep[] = [
  // Installation & fonctionnement
  { id: 'welcome', audience: 'staff' },
  { id: 'welcomeUser', audience: 'user' },
  { id: 'architecture', audience: 'staff' },
  { id: 'install', audience: 'admin' },
  { id: 'network', audience: 'admin' },
  { id: 'flow', audience: 'staff' },
  { id: 'checklist', audience: 'admin' },

  // Interface
  { id: 'sidebar', audience: 'all', focus: 'sidebar' },
  { id: 'search', audience: 'all', focus: 'topbar-search' },
  { id: 'lang', audience: 'all', focus: 'topbar-lang' },
  { id: 'theme', audience: 'all', focus: 'topbar-theme' },
  { id: 'density', audience: 'all', focus: 'topbar-density' },
  { id: 'notifs', audience: 'all', focus: 'topbar-notifs' },

  // Pages
  page('dashboard', 'staff', '/'),
  { id: 'onboarding', audience: 'admin', route: '/', focus: 'onboarding' },
  page('myproxies', 'user', '/'),
  page('subusers', 'admin', '/subusers'),
  { id: 'testaccount', audience: 'admin', route: '/subusers', focus: 'content' },
  page('users', 'admin', '/users'),
  page('pool', 'staff', '/pool'),
  page('proxypools', 'admin', '/proxy-pools'),
  page('scraper', 'admin', '/scraper'),
  page('checker', 'admin', '/checker'),
  page('bannedips', 'admin', '/banned-ips'),
  page('analytics', 'staff', '/analytics'),
  page('logs', 'staff', '/logs'),
  page('reports', 'staff', '/reports'),
  page('audit', 'staff', '/audit'),
  page('diagnostics', 'admin', '/diagnostics'),
  page('errors', 'staff', '/errors'),
  page('addons', 'admin', '/addons-manage'),
  page('addondocs', 'admin', '/addon-docs'),
  { id: 'docs', audience: 'all', focus: 'nav:docs' },

  // Paramètres, onglet par onglet
  page('settings', 'admin', '/settings'),
  settingsTab('dashboard'),
  settingsTab('general'),
  settingsTab('theme'),
  settingsTab('security'),
  settingsTab('captcha'),
  settingsTab('apikey'),
  settingsTab('proxy'),
  settingsTab('scraper'),
  settingsTab('smtp'),
  settingsTab('webhooks'),
  settingsTab('backups'),
  settingsTab('extensions'),

  // Compte
  page('apikeys', 'all', '/api-keys'),
  { id: 'profile', audience: 'all', route: '/profile', focus: 'content' },
  { id: 'security', audience: 'all', route: '/security', focus: 'content' },
  page('help', 'all', '/help'),
  page('about', 'all', '/about'),
  { id: 'finish', audience: 'all' },
];

export function stepsForRole(role?: string): TourStep[] {
  const isAdmin = role === 'ADMIN';
  const isStaff = isAdmin || role === 'SUPPORT';
  return TOUR_STEPS.filter((s) => {
    if (s.audience === 'all') return true;
    if (s.audience === 'admin') return isAdmin;
    if (s.audience === 'staff') return isStaff;
    return !isStaff; // 'user'
  });
}
