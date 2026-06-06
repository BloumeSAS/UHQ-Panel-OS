import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Configuration de la connexion base de données — résolue AVANT l'initialisation
 * de Nest (donc en helpers purs, sans DI).
 *
 * Deux sources possibles, dans l'ordre :
 *   1. `process.env.DATABASE_URL` — fourni par l'env (Coolify) ou le compose
 *      auto-hébergé (PostgreSQL 18 embarqué).
 *   2. Fichier persistant `DATA_DIR/runtime.json` — écrit au premier démarrage
 *      quand l'utilisateur saisit son lien externe dans l'assistant.
 *
 * Si aucune n'est disponible, l'application démarre quand même (mode « base non
 * configurée ») : seul l'écran de configuration de la base est actif.
 */

export type DbSource = 'env' | 'file' | 'none';

/** URL factice : permet de construire PrismaClient sans planter quand la base n'est pas encore configurée. */
export const PLACEHOLDER_DB_URL =
  'postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder';

export function dataDir(): string {
  return process.env.DATA_DIR || join(process.cwd(), 'data');
}

function runtimeFile(): string {
  return join(dataDir(), 'runtime.json');
}

interface RuntimeConfig {
  databaseUrl?: string;
}

export function loadRuntimeConfig(): RuntimeConfig {
  try {
    const file = runtimeFile();
    if (!existsSync(file)) return {};
    return JSON.parse(readFileSync(file, 'utf8')) as RuntimeConfig;
  } catch {
    return {};
  }
}

export function saveDatabaseUrl(url: string): void {
  const dir = dataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const current = loadRuntimeConfig();
  writeFileSync(runtimeFile(), JSON.stringify({ ...current, databaseUrl: url }, null, 2), 'utf8');
}

/** Résout l'URL effective et sa source (sans tenir compte du placeholder). */
export function resolveDatabaseUrl(): { url: string | null; source: DbSource } {
  const env = process.env.DATABASE_URL;
  if (env && env.trim() && env !== PLACEHOLDER_DB_URL) return { url: env, source: 'env' };
  const file = loadRuntimeConfig().databaseUrl;
  if (file && file.trim()) return { url: file, source: 'file' };
  return { url: null, source: 'none' };
}

/**
 * Pose `process.env.DATABASE_URL` pour que PrismaClient se construise.
 * Retourne l'état de configuration. À appeler tout au début du bootstrap,
 * avant que Nest n'instancie PrismaService.
 */
export function applyDatabaseEnv(): { configured: boolean; source: DbSource } {
  const { url, source } = resolveDatabaseUrl();
  if (url) {
    process.env.DATABASE_URL = url;
    return { configured: true, source };
  }
  // Aucune base : placeholder pour permettre la construction du client.
  process.env.DATABASE_URL = PLACEHOLDER_DB_URL;
  return { configured: false, source: 'none' };
}

/** Validation basique d'une URL de connexion PostgreSQL. */
export function isValidPostgresUrl(url: string): boolean {
  return /^postgres(ql)?:\/\/[^\s]+$/.test(url.trim());
}
