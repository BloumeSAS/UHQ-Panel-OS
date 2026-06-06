# Développer un addon pour UHQ Panel OS

> Guide complet pour créer votre propre addon compatible avec UHQ Panel OS.

---

## Qu'est-ce qu'un addon ?

Un addon UHQ Panel OS est un **microservice indépendant** qui :
- Possède sa **propre base de données** et son **propre frontend**
- Se connecte au panel via une **URL unique**
- Étend l'interface du panel sans modifier son code source
- Communique avec les utilisateurs via le **JWT** du panel

Le panel ne contient **aucun code spécifique** à un addon — tout est déclaratif via le fichier `uhq-manifest.json`.

---

## Stack obligatoire

| Couche | Technologie |
|---|---|
| Backend | **NestJS 10+** |
| Frontend | **React 18+** (Vite recommandé) |
| Données | Au choix (JSON, SQLite, PostgreSQL…) |

---

## Structure minimale

```
mon-addon/
├── api/                  ← NestJS
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── manifest/
│   │   │   └── manifest.controller.ts   GET /uhq-manifest.json
│   │   └── mon-feature/
│   │       ├── *.module.ts
│   │       ├── *.controller.ts          Routes sous /api/*
│   │       └── *.service.ts
│   ├── nest-cli.json
│   ├── package.json
│   └── tsconfig.json
├── web/                  ← React
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx       Routes pages + /widget/*
│   │   ├── context.tsx   token, lang, theme, role depuis URL params
│   │   └── pages/
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── uhq-manifest.json     ← Déclaration de l'addon
├── .env.example
├── Dockerfile
└── docker-compose.coolify.yml
```

---

## Le manifest — `uhq-manifest.json`

C'est le contrat entre votre addon et le panel. Il doit être accessible à `<votre-url>/uhq-manifest.json`.

### Champs obligatoires

```json
{
  "name": "Mon Addon",
  "pages": [
    { "path": "/", "label": "Mon Addon", "showInNavbar": true }
  ]
}
```

### Manifest complet annoté

```json
{
  // ── Identité ──────────────────────────────────────────────────────────────
  "name":        "Mon Addon",
  "version":     "1.0.0",
  "description": "Description courte affichée dans le panel",
  "icon":        "ShoppingBag",        // Icône Lucide React
  "license":     "MIT",

  // ── Auteur ────────────────────────────────────────────────────────────────
  "author": {
    "name":  "Votre Société",
    "email": "contact@exemple.com",
    "url":   "https://exemple.com"
  },
  "homepage":   "https://docs.exemple.com/addon",
  "repository": "https://github.com/vous/mon-addon",

  // ── Pages (iframes pleine page dans le panel) ─────────────────────────────
  "pages": [
    {
      "path":         "/",         // Route relative sur votre addon
      "label":        "Mon addon", // Texte ou clé i18n
      "icon":         "Star",      // Icône Lucide (optionnel)
      "showInNavbar": true,        // Afficher dans la sidebar (défaut: true)
      "adminOnly":    false        // Réservé aux admins (défaut: false)
    },
    {
      "path":         "/admin",
      "label":        "addon.myapp.admin",
      "icon":         "Settings",
      "showInNavbar": true,
      "adminOnly":    true
    }
  ],

  // ── Slots UI (items injectés dans des zones du panel) ─────────────────────
  "slots": [
    {
      "zone":      "topbar",       // Seule zone disponible actuellement
      "label":     "Mon raccourci",
      "icon":      "Star",
      "page":      "/",            // Page de l'addon à ouvrir au clic
      "adminOnly": false
    }
  ],

  // ── Widgets (micro-iframes sur des pages du panel) ────────────────────────
  "widgets": [
    {
      "zone":   "/",              // Pathname exact de la page panel
      "path":   "/widget/stats", // Route sur votre addon
      "height": 120,             // Hauteur de l'iframe en px
      "label":  "Mes statistiques"
    },
    {
      "zone":   "/subusers",
      "path":   "/widget/table",
      "height": 300,
      "label":  "addon.myapp.table"
    }
  ],

  // ── Traductions (fusionnées dans le panel au runtime) ─────────────────────
  "translations": {
    "fr": {
      "addon.myapp.admin": "Administration",
      "addon.myapp.table": "Tableau des données"
    },
    "en": {
      "addon.myapp.admin": "Administration",
      "addon.myapp.table": "Data table"
    }
  },

  // ── Authentification ──────────────────────────────────────────────────────
  "auth": {
    "passJwt":      true,    // Le panel ajoute ?token=<jwt> aux URLs
    "passUserInfo": true     // Le panel ajoute ?email=...&role=...
  },

  // ── Backup (intégration avec le système de backup du panel) ───────────────
  "backup": {
    "exportEndpoint": "/api/backup/export",   // GET → retourne vos données
    "importEndpoint": "/api/backup/import",   // POST body=données → restaure
    "authHeader":     "X-Panel-Key"           // Header d'auth (défaut)
  }
}
```

---

## NestJS — Setup minimal

### `api/src/main.ts`

```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: { origin: '*' } });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
```

### `api/src/manifest/manifest.controller.ts`

```typescript
import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import * as path from 'path';

@Controller()
export class ManifestController {
  @Get('uhq-manifest.json')
  getManifest(@Res() res: Response) {
    // dist/manifest/ → dist/ → api/ → addon-root/
    const p = path.resolve(__dirname, '..', '..', '..', 'uhq-manifest.json');
    res.sendFile(p);
  }
}
```

### `api/src/app.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as path from 'path';
import { ManifestController } from './manifest/manifest.controller';
import { MonFeatureModule } from './mon-feature/mon-feature.module';

@Module({
  imports: [
    // Sert le build React (SPA fallback)
    ServeStaticModule.forRoot({
      rootPath: path.join(__dirname, '..', '..', 'web', 'dist'),
      exclude: ['/api/(.*)'],
    }),
    MonFeatureModule,
  ],
  controllers: [ManifestController],
})
export class AppModule {}
```

---

## React — Setup minimal

### `web/src/context.tsx` — Paramètres du panel

```typescript
// Le panel injecte ces paramètres via les query params de l'URL iframe
import { createContext, useContext, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const Ctx = createContext({ token: '', lang: 'fr', theme: 'dark', role: 'USER' });

export function AddonProvider({ children }) {
  const [params] = useSearchParams();
  const ctx = {
    token: params.get('token') ?? '',
    lang:  params.get('lang')  ?? 'fr',
    theme: params.get('theme') ?? 'dark',
    role:  params.get('role')  ?? 'USER',
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', ctx.theme);
  }, [ctx.theme]);

  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

export const useAddon = () => useContext(Ctx);
```

### `web/src/App.tsx` — Routes

```typescript
import { Routes, Route } from 'react-router-dom';
import { AddonProvider } from './context';
import MaPage        from './pages/MaPage';
import AdminPage     from './pages/AdminPage';
import MonWidget     from './widgets/MonWidget';

export default function App() {
  return (
    <AddonProvider>
      <Routes>
        <Route path="/"              element={<MaPage />} />
        <Route path="/admin"         element={<AdminPage />} />
        <Route path="/widget/stats"  element={<MonWidget />} />
      </Routes>
    </AddonProvider>
  );
}
```

### `web/vite.config.ts` — Proxy dev

```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api':               'http://localhost:3001',
      '/uhq-manifest.json': 'http://localhost:3001',
    },
  },
});
```

---

## Appeler l'API du panel depuis votre addon

Votre addon reçoit un JWT via `?token=`. Utilisez-le pour appeler l'API du panel.

```typescript
// Depuis votre addon NestJS :
const response = await fetch(`${process.env.PANEL_URL}/api/panel/me`, {
  headers: { Authorization: `Bearer ${userToken}` },
});
const user = await response.json();

// Endpoints utiles :
// GET /api/panel/me           → infos utilisateur courant
// GET /api/panel/subusers     → comptes proxy de l'utilisateur
```

---

## Intégration Backup

Implémentez ces deux endpoints dans votre NestJS :

```typescript
@Controller('api/backup')
export class BackupController {
  @Get('export')
  export(@Headers('x-panel-key') key: string) {
    // Vérifier key === process.env.PANEL_API_KEY
    return { /* vos données à sauvegarder */ };
  }

  @Post('import')
  import(@Headers('x-panel-key') key: string, @Body() data: any) {
    // Restaurer vos données depuis data
    return { success: true };
  }
}
```

---

## Zones disponibles

### `slots.zone`

| Zone | Description |
|---|---|
| `"topbar"` | Dropdown en haut à droite (clic sur email/rôle) |

### `widgets.zone`

N'importe quel **pathname exact** de page du panel :

| Zone | Page panel |
|---|---|
| `"/"` | Dashboard |
| `"/subusers"` | Sous-utilisateurs |
| `"/users"` | Utilisateurs panel |
| `"/pool"` | Pool de proxies |
| `"/reports"` | Rapports |
| `"*"` | Toutes les pages |

---

## Docker — Template Dockerfile

```dockerfile
FROM node:20-alpine AS web-builder
WORKDIR /build/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:20-alpine AS api-builder
WORKDIR /build/api
COPY api/package*.json ./
RUN npm ci
COPY api/ ./
RUN npm run build
RUN npm prune --production

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=api-builder /build/api/dist        ./api/dist
COPY --from=api-builder /build/api/node_modules ./api/node_modules
COPY --from=web-builder /build/web/dist        ./web/dist
COPY uhq-manifest.json ./
RUN mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 3001
ENV NODE_ENV=production DB_PATH=/app/data/data.json
CMD ["node", "api/dist/main"]
```

---

## Checklist avant publication

- [ ] `uhq-manifest.json` avec `name`, `version`, `pages`
- [ ] `GET /uhq-manifest.json` accessible publiquement
- [ ] Routes React séparées pour pages (`/`, `/admin`) et widgets (`/widget/*`)
- [ ] Thème dynamique via `?theme=dark|light` sur `<html data-theme>`
- [ ] JWT lu depuis `?token=` (jamais stocké en cookie)
- [ ] `.env.example` documenté
- [ ] `Dockerfile` + `docker-compose.coolify.yml`
- [ ] README avec badge "Free/Pro Addon by Bloume SAS" (si applicable)

---

## Ressources

- [UHQ Panel OS](https://github.com/BloumeSAS/UHQ-Panel-OS)
- [Addon Wallet (exemple)](https://github.com/BloumeSAS/UHQ-Addon-Wallet)
- [Bloume SAS](https://bloume.fr)
- [NestJS Docs](https://docs.nestjs.com)
- [Lucide Icons](https://lucide.dev/icons)
