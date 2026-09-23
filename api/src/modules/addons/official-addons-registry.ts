import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface OfficialAddonEntry {
  name: string;
  slug: string;
  version: string;
  description: string;
  icon?: string;
  free: boolean;
  official: boolean;
  license?: string;
  author?: { name: string; url?: string } | string;
  repository?: string;
  homepage?: string;
  tags?: string[];
  requires?: string[];
  features?: string[];
  /** Port interne sur lequel la version embarquée écoute, si cet addon a été build dans l'image (cf. addons/build-bundled.sh). Absent = addon externe uniquement (pas de bouton "Activer"). */
  bundlePort?: number;
  /** Variables d'environnement additionnelles à injecter au démarrage du process embarqué (ex. WALLET_URL pour Orders). */
  extraEnv?: Record<string, string>;
}

/**
 * Résout `addons/addons.json` — source unique du catalogue d'addons
 * officiels, lue localement (jamais de fetch réseau ici : le fichier est
 * copié dans l'image au build, cf. Dockerfile stage `runner`). Ajouter un
 * futur addon officiel = ajouter une entrée à ce fichier, il apparaît
 * automatiquement dans le panel au prochain déploiement — sans toucher au
 * code de ce module.
 */
function resolveRegistryPath(): string {
  const candidates = [
    join(__dirname, '..', '..', '..', 'addons', 'addons.json'), // image Docker : /app/addons/addons.json
    join(__dirname, '..', '..', '..', '..', 'addons', 'addons.json'), // monorepo local : api/ et addons/ frères
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}

let cache: OfficialAddonEntry[] | null = null;

/** Lit (et met en cache process — le fichier ne change jamais après build) le registre des addons officiels. */
export function loadOfficialAddons(): OfficialAddonEntry[] {
  if (cache) return cache;
  try {
    const raw = readFileSync(resolveRegistryPath(), 'utf8');
    cache = JSON.parse(raw) as OfficialAddonEntry[];
  } catch {
    cache = [];
  }
  return cache;
}

/** Répertoire où sont copiées les versions embarquées build (cf. Dockerfile) — un sous-dossier par slug. */
export function bundledAddonDir(slug: string): string {
  const candidates = [
    join(__dirname, '..', '..', '..', 'addons', 'bundled', slug),
    join(__dirname, '..', '..', '..', '..', 'addons', 'bundled', slug),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}

/** true si CETTE image contient réellement le build de l'addon (pas juste une entrée de registre). */
export function isBundleAvailable(slug: string): boolean {
  const dir = bundledAddonDir(slug);
  return existsSync(join(dir, 'api', 'dist', 'main.js'));
}
