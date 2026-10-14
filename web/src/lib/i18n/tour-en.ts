/** Guided tour texts (key `tour.<id>.t` = title, `.b` = body). See lib/tour/steps.ts. */
export const tourEn: Record<string, string> = {
  'tour.start': 'Guided tour',
  'tour.startHint': 'Restart the panel guided tour',
  'tour.next': 'Next',
  'tour.prev': 'Previous',
  'tour.skip': 'Skip the tour',
  'tour.finish': 'Finish',
  'tour.step': 'Step {n} of {total}',
  'tour.offscreen': 'This element is hidden on small screens: open the menu (☰) to see it.',

  // ───────────── Installation & how it works ─────────────
  'tour.welcome.t': 'Welcome to UHQ Panel OS 🎉',
  'tour.welcome.b':
    "Installation is complete. This ~5 minute tour explains, step by step, how the panel works and where to configure everything.\n\nUse “Next” (or the ← → keys). You can leave at any time with “Skip the tour” or Esc, and restart it from the ? icon at the top right.",
  'tour.welcomeUser.t': 'Welcome 👋',
  'tour.welcomeUser.b':
    "Here is a quick tour of your space: your proxies, your API keys and your account security. “Next” to continue, Esc to leave.",
  'tour.architecture.t': 'How it works: the architecture',
  'tour.architecture.b':
    "UHQ Panel OS is a single application (one Docker image) that does three things:\n• the web panel and REST API, on port 8000 (this interface);\n• the TCP proxy engine, on port 990, which your customers use as an HTTP proxy (HTTPS goes through CONNECT);\n• the connection to a PostgreSQL database that stores everything (accounts, proxies, settings, history).\n\nThe panel does not sell its own IPs: it resells a pool of upstream proxies (scraped, imported or bought from a provider) through accounts that you create.",
  'tour.install.t': 'Ways to install the panel',
  'tour.install.b':
    "You already picked yours, but here are all the options:\n• Docker Compose “all-in-one”: docker-compose.yml starts the panel + an embedded PostgreSQL database. Zero configuration.\n• Coolify (build from GitHub): deployment from the repository sources. After each code update click “Redeploy”, then check the version number in the footer.\n• External database: on first start the “Database” screen accepts any PostgreSQL URL (postgresql://user:password@host:5432/db); the database is created if needed and the schema applied automatically.\n• Restore: on /setup of a fresh install, the “Restore a backup” tab accepts a panel backup (.json) or the PostgreSQL 16 data directory (.tar.gz). That screen locks as soon as installation is complete.",
  'tour.network.t': 'Ports, domain and firewall',
  'tour.network.b':
    "For your customers to connect:\n• Port 8000 (panel/API) is published behind your HTTPS domain (Traefik/Coolify, Nginx, Cloudflare…).\n• TCP port 990 (proxy engine) must be published on the host and opened in the firewall. It does NOT go through Cloudflare or an HTTP reverse proxy: use the server IP or a DNS-only domain (grey cloud).\n• The 9000–9250 range is used for dedicated ports (one port reserved for an account or a category).\n• Set the host and port shown to customers in Settings → Proxy engine.",
  'tour.flow.t': 'The path of a proxy connection',
  'tour.flow.b':
    "1. The client connects to host:990 with a proxy account's username and password.\n2. The panel checks the account (active, not expired, quota, allowed IPs, threads) and picks an upstream proxy from its category's pool.\n3. Several candidates race: the fastest wins. On failure another is tried, then the fallback proxy if the pool is empty.\n4. Traffic is counted on the upstream side (bytes actually billed) and charged to the account, with the category multiplier.\n5. When the quota is reached, the account's tunnels are cut immediately.",
  'tour.checklist.t': 'The first 6 things to do',
  'tour.checklist.b':
    "1. Settings → Proxy engine: set the public host and port.\n2. Feed the pool: add scraper sources (Scraper sources) or import your proxies (Proxy pool).\n3. Create a category (Proxy categories) to group proxies and apply rules.\n4. Create a proxy account (Proxy accounts) with its quota and category.\n5. Test the connection with the account's host:port:user:pass line.\n6. Secure: admin 2FA, captcha, automatic backups (Settings).\n\nThe next steps detail each of these pages.",

  // ───────────── Interface ─────────────
  'tour.sidebar.t': 'The side menu',
  'tour.sidebar.b':
    "All pages are here, grouped by section: Management, Sourcing & security, Monitoring, System, Extensions and Account. The pages shown depend on your role (administrator, support or user). On a phone it opens with the ☰ button.",
  'tour.search.t': 'Global search',
  'tour.search.b': "Type to instantly find a panel page, a proxy account or a user. Handy to navigate without using the menu.",
  'tour.lang.t': 'Language',
  'tour.lang.b': "Changes the interface language. The choice is remembered in this browser. The site's default language is set in Settings → General.",
  'tour.theme.t': 'Light / dark theme',
  'tour.theme.b': "Switches between light and dark mode. The colors themselves are customized in Settings → Theme.",
  'tour.density.t': 'Table density',
  'tour.density.b': "Comfortable (airy) or compact (more rows on screen). Useful with large lists of accounts or proxies.",
  'tour.notifs.t': 'Notifications',
  'tour.notifs.b': "The bell flags important events: dead proxies, exceeded quotas, new users, bans… The red badge counts unread ones. Alerts can also go to Discord, Slack or BloumeChat (Settings → Webhooks).",
  'tour.dashboard.t': 'Dashboard',
  'tour.dashboard.b':
    "The heart of monitoring, in real time:\n• active threads and sessions, working / total / banned proxies;\n• today's consumption and requests;\n• most used domains, active accounts, bandwidth and quotas;\n• pool health (by provider, protocol, country) and system health.\nActive extensions can add their own widgets here.",
  'tour.subusers.t': 'Proxy accounts',
  'tour.subusers.b':
    "This is where you create what your customers use. Each account has:\n• a username + password, a label, tags, a category;\n• a traffic quota (decimal GB, 0 = unlimited), a thread limit, a maximum bandwidth (KB/s) and an expiry date;\n• options: country filter, allowed IPs, blocked domains, sticky session TTL, dedicated port or domain;\n• optionally, a private proxy list that replaces the shared pool.\nUseful buttons: generate a sticky list (one fixed IP per session), reset traffic, block/unblock, view statistics, share a link, bulk actions.\nThe </> “Connection generator” icon produces, ready to copy, every form for the customer: host:port:user:pass, URL, curl, Python, Node, Playwright, Puppeteer, browser.",
  'tour.users.t': 'Panel users',
  'tour.users.b':
    "The people who log in to THIS panel (not to be confused with proxy accounts). Three roles:\n• Admin: manages everything;\n• Support: read-only on monitoring;\n• User: sees only their own proxy accounts.\nYou can create, edit, deactivate, set an expiry, invite by e-mail, assign proxy accounts to a user and export to CSV. The 2FA column shows who enabled two-factor authentication.",
  'tour.pool.t': 'Proxy pool',
  'tour.pool.b':
    "The list of all upstream proxies used by the engine. You can:\n• import your proxies (one per line: ip:port, proto://ip:port or ip:port:user:pass), forcing the protocol if needed;\n• filter by state (working, dead, permanent), category, country;\n• test a proxy's latency, revive it, blacklist it or delete it;\n• delete all dead proxies or revive all of them;\n• set a fallback proxy, used when the pool is exhausted.",
  'tour.proxypools.t': 'Proxy categories',
  'tour.proxypools.b':
    "Group your proxies (Datacenter, Mobile, Residential…) and apply rules to the whole category:\n• dedicated port and domain;\n• “Always online” (never marked dead) and checker toggle;\n• consumption multiplier (×2 = every GB consumed counts double);\n• Anti-VPN (refuses and bans client IPs identified as VPN for 24 h);\n• displayed (simulated) countries and IP counts.\nScraper sources and proxy accounts attach to a category.",
  'tour.scraper.t': 'Scraper sources',
  'tour.scraper.b':
    "The panel ships with no default source (except Groq AI): you add your own.\n• A source = a URL + a two-group regex (IP, port). Bulk URLs are accepted (one per line).\n• “Detect with Groq” guesses the regex for you if a Groq key is configured.\n• Test a source, run a cycle by hand, or let the automatic loop run at the chosen interval.\nCollected proxies are de-duplicated and sent to the checker.",
  'tour.checker.t': 'Checker',
  'tour.checker.b':
    "The checker continuously tests the pool's proxies: latency, country, whether they work. A proxy that fails too often is marked dead then blacklisted. This page shows live state (progress, duration, working/dead, global health) and the checker logs. You can stop/start the loop or run an immediate cycle. Intervals and concurrency are set in Settings → Scraper.",
  'tour.bannedips.t': 'Banned IPs',
  'tour.bannedips.b': "Fully blocks a client IP: the check happens before authentication, on every connection. Bans are manual or automatic (too many authentication failures, anti-VPN). You can add, remove and see the reason for each.",
  'tour.analytics.t': 'Analytics',
  'tour.analytics.b': "Pool health and performance over time: active proxies, latencies, breakdown by provider/protocol/country, history. For even deeper usage statistics (peak hours, per account, per category), enable the Analytics extension.",
  'tour.logs.t': 'Live logs',
  'tour.logs.b': "The server log stream in real time: connections, errors, scraper and checker cycles. Filter by level, pause, download or clear, and keep it open to diagnose an incident.",
  'tour.reports.t': 'Reports & statistics',
  'tour.reports.b': "Consumption and usage by period (day, week, month, year or all history), per account and per user. Periodic reports can also be e-mailed (Settings → E-mail).",
  'tour.audit.t': 'Audit log',
  'tour.audit.b': "The history of every action administrators performed on the panel (account creation, setting change, API key regeneration…): who, what, when. Essential to trace the origin of a change.",
  'tour.addons.t': 'Extensions',
  'tour.addons.b':
    "Add features to the panel without touching the code:\n• Free official extensions (Wallet, Orders, Analytics): bundled in the image, enabled in one click with “Activate”. Their state is kept after a restart.\n• External extensions: paste the URL of a service that exposes a JSON manifest; the panel reads the pages, widgets and menus to integrate.\nEach extension can add menu pages, dashboard widgets and settings.",
  'tour.addondocs.t': 'Developer guide',
  'tour.addondocs.b': "To build your own extension: manifest format, available slots (pages, widgets, top bar), authentication and examples. Only useful if you develop extensions.",
  'tour.docs.t': 'API documentation',
  'tour.docs.b': "Opens the interactive REST API documentation (Swagger/Scalar) in a new tab: every route, parameter and example to automate the panel.",

  // ───────────── Settings ─────────────
  'tour.settings.t': 'Settings',
  'tour.settings.b': "The configuration center. The tabs on the left are grouped by theme (Overview, General, Security, Proxy engine, Communications, System, Extensions). The next steps walk through each tab. Remember to click “Save” after any change.",
  'tour.s_dashboard.t': 'Settings › Dashboard',
  'tour.s_dashboard.b': "A live overview of the engine: active threads, sessions, pool health and system load. No settings here, it's a quick glance.",
  'tour.s_general.t': 'Settings › General',
  'tour.s_general.b': "Panel identity: name and logo (shown in the header), default language, opening or closing public registrations, invitations, maintenance mode, plus configuration import/export.",
  'tour.s_theme.t': 'Settings › Theme',
  'tour.s_theme.b': "Customize the panel colors in light and dark mode, or import a theme from tweakcn. The theme also applies to extensions.",
  'tour.s_security.t': 'Settings › Security',
  'tour.s_security.b': "Mandatory 2FA for administrators, brute-force protection of the proxy engine (automatic ban after too many failures), trusting Cloudflare IPs (enable only behind Cloudflare), VPN ban duration, and retention periods for logs, notifications and histories.",
  'tour.s_captcha.t': 'Settings › Captcha',
  'tour.s_captcha.b': "Anti-bot protection on login, registration and password reset. Choose hCaptcha, reCAPTCHA, Cloudflare Turnstile or Cap, then enter the site key and the secret key.",
  'tour.s_apikey.t': 'Settings › API key',
  'tour.s_apikey.b': "The key of the legacy /api/v1 API, sent in the X-API-Key header or as the Basic auth password. You can reveal or regenerate it (the old one stops working immediately). For keys with scopes and expiry, see the “API keys” page.",
  'tour.s_proxy.t': 'Settings › Proxy engine',
  'tour.s_proxy.b': "The public host and port shown to customers (required for connection lines to be correct), connection and “racing” timeouts between candidates, and closing of idle tunnels.",
  'tour.s_scraper.t': 'Settings › Scraper',
  'tour.s_scraper.b': "Collection, verification and geo-resolution intervals, minimum pool size, checker concurrency and timeout, failures before a proxy is declared dead, automatic loop start, fallback proxy and the Groq key for AI.",
  'tour.s_smtp.t': 'Settings › E-mail (SMTP)',
  'tour.s_smtp.b': "The e-mail sending server: login alerts, password reset, invitations and periodic reports. Fill in host, port, credentials, sender, then send a test e-mail.",
  'tour.s_webhooks.t': 'Settings › Webhooks',
  'tour.s_webhooks.b': "Alerts to Discord, Slack or BloumeChat: exceeded quotas, dead proxies, nearly empty pool, new users. Paste the webhook URL and choose which alerts to enable.",
  'tour.s_backups.t': 'Settings › Backups',
  'tour.s_backups.b': "Automatic database backups (cron schedule), to local or S3-compatible storage. You can run a backup by hand, restore or delete a backup, and export/import settings only. Enable it from day one: it is your safety net.",
  'tour.s_extensions.t': 'Settings › Extensions',
  'tour.s_extensions.b': "Settings specific to active extensions (shop, balance, etc.). The tab is empty as long as no extension declares settings.",

  // ───────────── Account ─────────────
  'tour.apikeys.t': 'API keys',
  'tour.apikeys.b': "Create personal API keys with a scope (what they may do) and an expiry date, to automate the panel from your scripts. The key is shown only once at creation: copy it right away. You can revoke it at any time.",
  'tour.myproxies.t': 'My proxies',
  'tour.myproxies.b': "Your proxy accounts: username, password, used traffic and quota, expiry. You will find the connection line (host:port:username:password), can generate sticky lists and view your usage statistics.",
  'tour.profile.t': 'Profile',
  'tour.profile.b': "Your account: e-mail and password change. Also reachable from the e-mail/role area of the top bar.",
  'tour.security.t': 'Account security',
  'tour.security.b': "Enable two-factor authentication (authenticator app + recovery codes) and manage your active sessions by signing them out one by one. Strongly recommended, and mandatory for admins if you enable it in Settings → Security.",
  'tour.about.t': 'About',
  'tour.about.b': "The installed version, version history and update. When a new version exists, the “Update now” button asks your platform (Coolify) to rebuild and restart the panel, with a progress screen and automatic reconnection. Set it up once in Settings → General → Automatic update.",
  'tour.finish.t': "All done! ✅",
  'tour.finish.b':
    "You now know the whole panel. Recap:\n• public host/port → Settings → Proxy engine;\n• feed the pool → Scraper sources or Proxy pool;\n• categories → rules per group of proxies;\n• proxy accounts → what you give your customers;\n• backups → Settings → Backups.\n\nYou can restart this tour any time with the ? icon at the top right.",
};
