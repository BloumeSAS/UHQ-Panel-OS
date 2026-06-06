import { useState } from 'react';
import {
  BookOpen,
  FolderOpen,
  FileJson,
  LayoutTemplate,
  Puzzle,
  ShieldCheck,
  Database,
  Container,
  ChevronRight,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui';

/* ─── Helpers ───────────────────────────────────────────────────────────────── */
function Code({ children, lang = '' }: { children: string; lang?: string }) {
  return (
    <div className="relative">
      {lang && (
        <span className="absolute right-3 top-2 text-[10px] font-mono text-muted-foreground select-none">
          {lang}
        </span>
      )}
      <pre className="overflow-x-auto rounded-md bg-muted p-4 text-xs font-mono leading-relaxed text-foreground">
        {children.trim()}
      </pre>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold border-b pb-2">{title}</h2>
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>;
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground">
      💡 {children}
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-sm text-foreground">
      ⚠️ {children}
    </div>
  );
}

/* ─── Sections content ──────────────────────────────────────────────────────── */

function SectionIntro() {
  return (
    <div className="space-y-6">
      <Section title="Introduction">
        <P>
          UHQ Panel OS prend en charge des <strong>addons</strong> — des microservices indépendants
          qui s'intègrent dans le panel via un fichier manifest JSON. Chaque addon est un service
          séparé (NestJS + React) que vous déployez où vous voulez ; le panel le connecte à son URL.
        </P>

        <SubSection title="Comment ça marche">
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>Vous déployez votre addon et exposez <code className="text-xs bg-muted px-1 rounded">/uhq-manifest.json</code></li>
            <li>Dans le panel → Extensions → Connecter, saisissez l'URL de base</li>
            <li>Le panel lit le manifest et injecte automatiquement les pages dans la sidebar, les slots dans la topbar, etc.</li>
            <li>Les iframes reçoivent le token JWT, la langue et le thème en querystring</li>
          </ol>
        </SubSection>

        <SubSection title="Stack obligatoire">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border p-3 space-y-1">
              <p className="text-sm font-medium">Backend</p>
              <p className="text-xs text-muted-foreground">NestJS 10+ (TypeScript)</p>
              <p className="text-xs text-muted-foreground">Port configurable via <code className="bg-muted px-1 rounded">PORT</code></p>
            </div>
            <div className="rounded-md border p-3 space-y-1">
              <p className="text-sm font-medium">Frontend</p>
              <p className="text-xs text-muted-foreground">React 18+ avec Vite</p>
              <p className="text-xs text-muted-foreground">Servi par NestJS via ServeStatic</p>
            </div>
          </div>
        </SubSection>

        <SubSection title="Exemple de manifest minimal">
          <Code lang="json">{`{
  "name": "Mon Addon",
  "version": "1.0.0",
  "pages": [
    { "path": "/", "label": "Mon Addon", "icon": "Star" }
  ]
}`}</Code>
          <Tip>Le seul champ obligatoire après <code>name</code> est <code>pages</code> avec au moins une entrée.</Tip>
        </SubSection>
      </Section>
    </div>
  );
}

function SectionStructure() {
  return (
    <div className="space-y-6">
      <Section title="Structure des fichiers">
        <P>Un addon UHQ est un monorepo avec deux sous-dossiers : <code className="text-xs bg-muted px-1 rounded">api/</code> (NestJS) et <code className="text-xs bg-muted px-1 rounded">web/</code> (React).</P>

        <Code lang="bash">{`mon-addon/
├── uhq-manifest.json          # Manifest — exposé via /uhq-manifest.json
├── .env.example               # Variables d'environnement
├── Dockerfile                 # Build multi-stage
├── docker-compose.yml         # Dev local
├── docker-compose.coolify.yml # Prod Coolify
├── README.md
├── api/                       # Backend NestJS
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── manifest/
│   │   │   └── manifest.controller.ts   # GET /uhq-manifest.json
│   │   ├── backup/
│   │   │   └── backup.controller.ts     # GET/POST /api/backup/*
│   │   └── <feature>/
│   │       ├── <feature>.module.ts
│   │       ├── <feature>.service.ts
│   │       ├── <feature>.controller.ts
│   │       └── store.service.ts         # Persistance JSON (aucune dep native)
│   ├── package.json
│   └── tsconfig.json
└── web/                       # Frontend React
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   └── context.tsx        # Lit token/lang/theme depuis ?querystring
    ├── index.html
    ├── vite.config.ts
    └── package.json`}</Code>

        <SubSection title="Pourquoi JSON file store ?">
          <P>
            Les addons n'ont <strong>pas besoin de base de données externe</strong>. Un simple fichier JSON atomique suffit
            dans la plupart des cas et évite toute dépendance native (ex: <code className="text-xs bg-muted px-1 rounded">better-sqlite3</code>) qui casse la compilation cross-platform.
          </P>
          <Tip>Écriture atomique = write vers <code>.tmp</code> puis <code>fs.renameSync</code>. Ainsi le fichier n'est jamais corrompu si le process est tué.</Tip>
        </SubSection>
      </Section>
    </div>
  );
}

function SectionManifest() {
  return (
    <div className="space-y-6">
      <Section title="uhq-manifest.json — Référence complète">
        <P>Le manifest décrit tout ce que le panel doit savoir sur votre addon.</P>

        <Code lang="json">{`{
  // ── Obligatoires ──────────────────────────────────────────────
  "name": "Mon Addon",
  "pages": [ /* voir section Pages */ ],

  // ── Identité ──────────────────────────────────────────────────
  "version": "1.0.0",        // Semver — incrémenté = mise à jour détectée
  "description": "…",
  "icon": "Star",            // Nom d'icône Lucide (fallback pour toutes les pages)
  "license": "MIT",

  // ── Auteur ────────────────────────────────────────────────────
  "author": {
    "name": "Bloume SAS",
    "email": "contact@bloume.fr",
    "url":   "https://bloume.fr"
  },
  "homepage":   "https://docs.bloume.fr/mon-addon",
  "repository": "https://github.com/bloumesas/mon-addon",

  // ── Injection UI ──────────────────────────────────────────────
  "slots":   [ /* voir section Slots */   ],
  "widgets": [ /* voir section Widgets */ ],

  // ── i18n ──────────────────────────────────────────────────────
  "translations": {
    "fr": { "addon.mon.key": "Mon texte FR" },
    "en": { "addon.mon.key": "My text EN"  }
  },

  // ── Auth ──────────────────────────────────────────────────────
  "auth": {
    "passJwt":      true,   // ?token= ajouté à toutes les URLs d'iframe
    "passUserInfo": true    // ?role=ADMIN&email=… ajoutés
  },

  // ── Backup ────────────────────────────────────────────────────
  "backup": {
    "exportEndpoint": "/api/backup/export",
    "importEndpoint": "/api/backup/import",
    "authHeader":     "X-Panel-Key"    // défaut si omis
  }
}`}</Code>

        <SubSection title="Champs de version">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Champ</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {[
                ['name', 'string', 'Obligatoire. Nom affiché dans le panel.'],
                ['version', 'string', 'Semver. Changement → badge "mise à jour" dans le panel.'],
                ['description', 'string', 'Texte court dans la card addon.'],
                ['icon', 'string', 'Icône Lucide globale (fallback si page/slot n\'en ont pas).'],
                ['author', 'object|string', 'Affiché dans la card. Peut être une chaîne simple.'],
                ['homepage', 'string', 'Lien vers la doc — bouton dans la card addon.'],
                ['repository', 'string', 'Lien vers le repo source.'],
                ['license', 'string', 'SPDX ex: MIT, Apache-2.0.'],
              ].map(([f, t, d]) => (
                <tr key={f} className="border-b">
                  <td className="py-2 pr-4 font-mono text-foreground">{f}</td>
                  <td className="py-2 pr-4">{t}</td>
                  <td className="py-2">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SubSection>
      </Section>
    </div>
  );
}

function SectionPages() {
  return (
    <div className="space-y-6">
      <Section title="Pages">
        <P>Les pages sont des iframes intégrées dans le panel avec une URL de la forme <code className="text-xs bg-muted px-1 rounded">/addons/:id/:path</code>.</P>

        <Code lang="json">{`"pages": [
  {
    "path":         "/",         // Route sur votre addon (ex: /, /admin, /widget)
    "label":        "Mon Addon", // Texte sidebar ou clé i18n (ex: addon.mon.nav)
    "icon":         "Star",      // Icône Lucide
    "showInNavbar": true,        // Apparaît dans la sidebar ? (défaut: true)
    "adminOnly":    false        // Visible uniquement par les ADMINs ? (défaut: false)
  },
  {
    "path":         "/admin",
    "label":        "addon.mon.admin",
    "icon":         "Settings",
    "showInNavbar": true,
    "adminOnly":    true
  }
]`}</Code>

        <SubSection title="Paramètres reçus dans l'iframe">
          <P>Le panel ajoute ces querystring à l'URL de l'iframe (si <code>auth.passJwt</code> / <code>passUserInfo</code> activés) :</P>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Paramètre</th>
                <th className="py-2 font-medium">Valeur</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {[
                ['?token=', 'JWT de la session courante'],
                ['?lang=', 'Code langue actif (fr, en, …)'],
                ['?theme=', 'dark ou light'],
                ['?role=', 'ADMIN ou USER (si passUserInfo: true)'],
                ['?email=', "E-mail de l'utilisateur (si passUserInfo: true)"],
              ].map(([p, v]) => (
                <tr key={p} className="border-b">
                  <td className="py-2 pr-4 font-mono text-foreground">{p}</td>
                  <td className="py-2">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SubSection>

        <SubSection title="Lecture côté React (context.tsx)">
          <Code lang="tsx">{`import { createContext, useContext, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

interface AddonCtx {
  token: string;
  lang:  'fr' | 'en';
  theme: 'dark' | 'light';
  role:  string;
  email: string;
}

const Ctx = createContext<AddonCtx>({ token:'', lang:'fr', theme:'dark', role:'USER', email:'' });
export const useAddon = () => useContext(Ctx);

export function AddonProvider({ children }: { children: React.ReactNode }) {
  const [params] = useSearchParams();
  const ctx: AddonCtx = {
    token: params.get('token') ?? '',
    lang:  (params.get('lang')  ?? 'fr') as 'fr' | 'en',
    theme: (params.get('theme') ?? 'dark') as 'dark' | 'light',
    role:  params.get('role')  ?? 'USER',
    email: params.get('email') ?? '',
  };
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', ctx.theme);
  }, [ctx.theme]);
  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}`}</Code>
        </SubSection>

        <SubSection title="Appel API panel depuis l'addon">
          <Code lang="ts">{`// Utiliser le token reçu dans ?token= pour appeler l'API panel
const { token } = useAddon();

const res = await fetch(\`\${import.meta.env.VITE_PANEL_URL}/api/panel/me\`, {
  headers: { Authorization: \`Bearer \${token}\` },
});
const me = await res.json();`}</Code>
          <Tip>Définir <code>VITE_PANEL_URL</code> dans le <code>.env</code> de votre addon web.</Tip>
        </SubSection>
      </Section>
    </div>
  );
}

function SectionSlots() {
  return (
    <div className="space-y-6">
      <Section title="Slots (topbar)">
        <P>Les slots permettent d'injecter des entrées dans le <strong>dropdown topbar</strong> du panel (zone email/rôle en haut à droite).</P>

        <Code lang="json">{`"slots": [
  {
    "zone":      "topbar",      // Seule zone disponible actuellement
    "label":     "addon.wallet.nav",  // Texte ou clé i18n
    "icon":      "Wallet",            // Icône Lucide
    "page":      "/",                 // Path d'une page déclarée dans "pages"
    "adminOnly": false
  }
]`}</Code>

        <SubSection title="Zones disponibles">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Zone</th>
                <th className="py-2 font-medium">Emplacement</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr>
                <td className="py-2 pr-4 font-mono text-foreground">topbar</td>
                <td className="py-2">Dropdown déclenché par la zone email/rôle en haut à droite</td>
              </tr>
            </tbody>
          </table>
          <Tip>D'autres zones (sidebar_bottom, dashboard_card) seront ajoutées dans les prochaines versions.</Tip>
        </SubSection>

        <SubSection title="Résolution des labels">
          <P>Le label est résolu dans cet ordre :</P>
          <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
            <li>Clé trouvée dans le système i18n du panel (via <code className="text-xs bg-muted px-1 rounded">manifest.translations</code> mergées)</li>
            <li>Clé trouvée dans <code className="text-xs bg-muted px-1 rounded">manifest.translations[lang]</code></li>
            <li>Fallback <code className="text-xs bg-muted px-1 rounded">fr</code> puis <code className="text-xs bg-muted px-1 rounded">en</code></li>
            <li>La clé brute si rien ne correspond</li>
          </ol>
        </SubSection>
      </Section>
    </div>
  );
}

function SectionWidgets() {
  return (
    <div className="space-y-6">
      <Section title="Widgets (micro-iframes)">
        <P>Les widgets sont des <strong>petites iframes</strong> injectées dans des pages spécifiques du panel, sans navigation (hauteur fixe).</P>

        <Code lang="json">{`"widgets": [
  {
    "zone":   "/",           // Pathname panel où injecter (ou "*" = partout)
    "path":   "/widget/dashboard",  // Route sur votre addon
    "height": 80,            // Hauteur px (défaut: 40)
    "label":  "Mon Widget"  // Label optionnel (debug)
  }
]`}</Code>

        <SubSection title="Zones de widgets">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Zone</th>
                <th className="py-2 font-medium">Page panel</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {[
                ['/', 'Dashboard'],
                ['/subusers', 'Comptes proxy'],
                ['/users', 'Utilisateurs'],
                ['/pool', 'Pool'],
                ['/reports', 'Rapports'],
                ['/settings', 'Paramètres'],
                ['*', 'Toutes les pages'],
              ].map(([z, p]) => (
                <tr key={z} className="border-b">
                  <td className="py-2 pr-4 font-mono text-foreground">{z}</td>
                  <td className="py-2">{p}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SubSection>
      </Section>
    </div>
  );
}

function SectionAuth() {
  return (
    <div className="space-y-6">
      <Section title="Authentification JWT">
        <P>
          Le panel transmet automatiquement le JWT de la session dans le querystring des iframes.
          Côté addon, vous vérifiez ce token en appelant l'API panel.
        </P>

        <SubSection title="Activer dans le manifest">
          <Code lang="json">{`"auth": {
  "passJwt":      true,  // Ajoute ?token=<jwt> à l'URL
  "passUserInfo": true   // Ajoute ?role=&email= également
}`}</Code>
        </SubSection>

        <SubSection title="Vérifier le JWT côté NestJS">
          <Code lang="typescript">{`// api/src/auth/jwt.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class PanelJwtGuard implements CanActivate {
  constructor(private http: HttpService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const token =
      req.headers.authorization?.replace('Bearer ', '') ??
      req.query.token;

    if (!token) throw new UnauthorizedException();

    try {
      // Vérifier via l'API panel
      const { data } = await firstValueFrom(
        this.http.get(\`\${process.env.PANEL_URL}/api/panel/me\`, {
          headers: { Authorization: \`Bearer \${token}\` },
        }),
      );
      req.panelUser = data.data;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}`}</Code>
        </SubSection>

        <Warn>
          Ne jamais exposer des endpoints sensibles sans vérification JWT. Utilisez <code>PanelJwtGuard</code> sur toutes les routes qui manipulent des données utilisateur.
        </Warn>
      </Section>
    </div>
  );
}

function SectionBackup() {
  return (
    <div className="space-y-6">
      <Section title="Backup automatique">
        <P>
          Le panel inclut automatiquement les addons dans ses sauvegardes si vous déclarez les endpoints
          <code className="text-xs bg-muted px-1 rounded"> backup.exportEndpoint</code> et <code className="text-xs bg-muted px-1 rounded">backup.importEndpoint</code> dans le manifest.
        </P>

        <SubSection title="Manifest">
          <Code lang="json">{`"backup": {
  "exportEndpoint": "/api/backup/export",
  "importEndpoint": "/api/backup/import",
  "authHeader":     "X-Panel-Key"
}`}</Code>
        </SubSection>

        <SubSection title="Contrôleur NestJS (backup.controller.ts)">
          <Code lang="typescript">{`import { Controller, Get, Post, Body, Headers, ForbiddenException } from '@nestjs/common';
import { StoreService } from '../store/store.service';

@Controller('api/backup')
export class BackupController {
  constructor(private store: StoreService) {}

  private checkKey(key: string) {
    const expected = process.env.PANEL_API_KEY;
    if (expected && key !== expected) throw new ForbiddenException();
  }

  @Get('export')
  export(@Headers('x-panel-key') key: string) {
    this.checkKey(key);
    return this.store.exportData();
  }

  @Post('import')
  import(
    @Headers('x-panel-key') key: string,
    @Body() snapshot: any,
  ) {
    this.checkKey(key);
    this.store.restoreData(snapshot);
    return { ok: true };
  }
}`}</Code>
        </SubSection>

        <SubSection title="Store service — méthode restoreData">
          <Code lang="typescript">{`// Ajouter dans votre store.service.ts
exportData() {
  return this.data; // retourne toute la donnée JSON
}

restoreData(snapshot: typeof this.data): void {
  Object.assign(this.data, snapshot);
  this.persist(); // écriture atomique vers le fichier JSON
}`}</Code>
        </SubSection>

        <Tip>
          Si votre addon est hors ligne lors d'une restauration, le panel continue sans erreur. Le backup addon est best-effort.
        </Tip>
      </Section>
    </div>
  );
}

function SectionDeployment() {
  return (
    <div className="space-y-6">
      <Section title="Déploiement">
        <SubSection title="Dockerfile (multi-stage)">
          <Code lang="dockerfile">{`# ── Stage 1 : Build React ──────────────────────────────────────────
FROM node:20-alpine AS web-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ .
RUN npm run build

# ── Stage 2 : Build NestJS ─────────────────────────────────────────
FROM node:20-alpine AS api-builder
WORKDIR /app/api
COPY api/package*.json ./
RUN npm ci
COPY api/ .
RUN npm run build

# ── Stage 3 : Runner ───────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Copier les dists
COPY --from=api-builder /app/api/dist     ./api/dist
COPY --from=api-builder /app/api/node_modules ./api/node_modules
COPY --from=web-builder /app/web/dist     ./web/dist

# Copier le manifest
COPY uhq-manifest.json ./

# Volume persistant pour les données
VOLUME ["/app/data"]
EXPOSE 3001

ENV NODE_ENV=production \\
    PORT=3001 \\
    DB_PATH=/app/data/data.json

CMD ["node", "api/dist/main"]`}</Code>
        </SubSection>

        <SubSection title="docker-compose.coolify.yml">
          <Code lang="yaml">{`services:
  mon-addon:
    image: \${SERVICE_IMAGE:-ghcr.io/vous/mon-addon:latest}
    volumes:
      - addon_data:/app/data
    environment:
      PORT:          "3001"
      PANEL_URL:     \${PANEL_URL}
      PANEL_API_KEY: \${PANEL_API_KEY}
      NODE_ENV:      production
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.mon-addon.rule=Host(\`\${DOMAIN}\`)"
      - "traefik.http.routers.mon-addon.tls=true"
      - "traefik.http.routers.mon-addon.tls.certresolver=letsencrypt"
      - "traefik.http.services.mon-addon.loadbalancer.server.port=3001"

volumes:
  addon_data:`}</Code>
          <Tip>Coolify monte automatiquement les volumes déclarés — vos données persistent entre les redéploiements.</Tip>
        </SubSection>

        <SubSection title=".env.example">
          <Code lang="env">{`# Port du microservice addon
PORT=3001

# URL du panel UHQ Panel OS auquel cet addon est connecté
PANEL_URL=http://localhost:8000

# Chemin du fichier JSON de données persistantes
# Local : ./data.json
# Docker/Coolify : /app/data/data.json
DB_PATH=./data.json

# Clé API du panel (Paramètres → Clé API → X-API-Key)
# Nécessaire pour les webhooks de backup automatique
PANEL_API_KEY=

# Environnement
NODE_ENV=development`}</Code>
        </SubSection>
      </Section>
    </div>
  );
}

function SectionI18n() {
  return (
    <div className="space-y-6">
      <Section title="Traductions (i18n)">
        <P>
          Déclarez vos traductions directement dans le manifest. Elles sont mergées dans le système
          i18n du panel au runtime — vos clés fonctionnent comme des clés natives.
        </P>

        <SubSection title="Déclaration dans le manifest">
          <Code lang="json">{`"translations": {
  "fr": {
    "addon.mon.nav":   "Mon Addon",
    "addon.mon.admin": "Administration"
  },
  "en": {
    "addon.mon.nav":   "My Addon",
    "addon.mon.admin": "Administration"
  }
}`}</Code>
        </SubSection>

        <SubSection title="Convention de nommage des clés">
          <Code lang="text">{`addon.<slug-addon>.<clé>

Exemples :
  addon.wallet.nav        → "Mon solde" / "My balance"
  addon.wallet.navAdmin   → "Gestion des soldes" / "Manage balances"
  addon.crm.contacts      → "Contacts"
  addon.crm.deals         → "Affaires" / "Deals"`}</Code>
          <Tip>Préfixez toujours avec <code>addon.&lt;votre-slug&gt;.</code> pour éviter les collisions avec le panel ou d'autres addons.</Tip>
        </SubSection>

        <SubSection title="Utiliser les clés dans les pages/slots">
          <Code lang="json">{`"pages": [
  { "path": "/",      "label": "addon.mon.nav",   "showInNavbar": false },
  { "path": "/admin", "label": "addon.mon.admin", "adminOnly": true }
],
"slots": [
  { "zone": "topbar", "label": "addon.mon.nav", "icon": "Star", "page": "/" }
]`}</Code>
        </SubSection>

        <SubSection title="Lecture de la langue dans l'iframe React">
          <Code lang="tsx">{`import { useAddon } from './context';

export function MyPage() {
  const { lang } = useAddon();

  const texts = {
    fr: { title: 'Bonjour', balance: 'Solde' },
    en: { title: 'Hello',   balance: 'Balance' },
  };
  const t = texts[lang as keyof typeof texts] ?? texts.fr;

  return <h1>{t.title}</h1>;
}`}</Code>
        </SubSection>
      </Section>
    </div>
  );
}

function SectionChecklist() {
  const items = [
    { done: true,  text: 'Créer uhq-manifest.json avec name + pages' },
    { done: true,  text: 'Exposer GET /uhq-manifest.json via ManifestController' },
    { done: false, text: 'Ajouter auth.passJwt: true si vous avez besoin du token' },
    { done: false, text: 'Préfixer les clés i18n avec addon.<votre-slug>.' },
    { done: false, text: 'Ne pas utiliser de dépendances natives (better-sqlite3, canvas…)' },
    { done: true,  text: 'Écriture atomique JSON (write → .tmp → renameSync)' },
    { done: false, text: 'Implémenter backup export/import si vous stockez des données' },
    { done: false, text: 'Sécuriser les endpoints backup avec X-Panel-Key' },
    { done: false, text: 'Dockerfile multi-stage (web-builder + api-builder + runner)' },
    { done: false, text: 'docker-compose.coolify.yml avec volume persistant' },
    { done: false, text: 'Incrémenter version dans le manifest à chaque release' },
    { done: false, text: '.env.example à jour' },
    { done: false, text: 'README avec badge "Free Addon by Bloume SAS" ou votre propre crédit' },
  ];

  return (
    <div className="space-y-6">
      <Section title="Checklist de publication">
        <P>Avant de connecter votre addon au panel, vérifiez ces points :</P>
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-3 text-sm">
              <span className={cn('mt-0.5 h-4 w-4 rounded-full flex-shrink-0 flex items-center justify-center text-[10px]',
                item.done
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-muted-foreground text-muted-foreground'
              )}>
                {item.done ? '✓' : '○'}
              </span>
              <span className={item.done ? 'text-muted-foreground line-through' : ''}>{item.text}</span>
            </div>
          ))}
        </div>
        <Tip>Le fichier <code>addons/ADDON_DEVELOPMENT.md</code> dans le repo contient le même guide en markdown pour référence hors-panel.</Tip>
      </Section>
    </div>
  );
}

/* ─── Nav items ──────────────────────────────────────────────────────────────── */
const NAV = [
  { id: 'intro',       label: 'Introduction',      icon: BookOpen,       component: SectionIntro },
  { id: 'structure',   label: 'Structure',          icon: FolderOpen,     component: SectionStructure },
  { id: 'manifest',    label: 'Manifest',           icon: FileJson,       component: SectionManifest },
  { id: 'pages',       label: 'Pages',              icon: LayoutTemplate, component: SectionPages },
  { id: 'slots',       label: 'Slots (topbar)',     icon: Layers,         component: SectionSlots },
  { id: 'widgets',     label: 'Widgets',            icon: Puzzle,         component: SectionWidgets },
  { id: 'i18n',        label: 'Traductions',        icon: BookOpen,       component: SectionI18n },
  { id: 'auth',        label: 'Authentification',   icon: ShieldCheck,    component: SectionAuth },
  { id: 'backup',      label: 'Backup',             icon: Database,       component: SectionBackup },
  { id: 'deployment',  label: 'Déploiement',        icon: Container,      component: SectionDeployment },
  { id: 'checklist',   label: 'Checklist',          icon: ChevronRight,   component: SectionChecklist },
] as const;

type NavId = (typeof NAV)[number]['id'];

/* ─── Page ───────────────────────────────────────────────────────────────────── */
export default function AddonDocs() {
  const [active, setActive] = useState<NavId>('intro');
  const current = NAV.find((n) => n.id === active)!;
  const Content = current.component;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Puzzle className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Guide développeur — Addons</h1>
          <p className="text-sm text-muted-foreground">
            Comment créer un addon compatible UHQ Panel OS
          </p>
        </div>
        <Badge variant="secondary" className="ml-auto">Stack : NestJS + React</Badge>
      </div>

      {/* Body : nav gauche + contenu */}
      <div className="flex gap-6">
        {/* Sidebar nav */}
        <aside className="w-48 flex-shrink-0">
          <nav className="sticky top-20 flex flex-col gap-0.5">
            {NAV.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActive(item.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors w-full',
                    active === item.id
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 space-y-6">
          <Content />
        </main>
      </div>
    </div>
  );
}
