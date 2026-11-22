import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';
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
  jwtSecret?: string;
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

/** Écrit (ou supprime si null) une clé de runtime.json en conservant les autres. */
export function saveRuntimeValue(key: string, value: string | null): void {
  const dir = dataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const current: Record<string, unknown> = { ...loadRuntimeConfig() };
  if (value === null) delete current[key];
  else current[key] = value;
  writeFileSync(runtimeFile(), JSON.stringify(current, null, 2), 'utf8');
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
 * Taille du pool Prisma. Par défaut Prisma n'ouvre que (2 × CPU + 1) connexions (9 sur 4 cœurs) : avec beaucoup de
 * tunnels VPN, le moteur proxy et les tâches de fond, le pool saturait (« Timed out fetching a new connection »)
 * et tout le panel tombait alors que la base était saine. Surcharge : DB_POOL_SIZE / DB_POOL_TIMEOUT (s) ;
 * une valeur déjà présente dans l'URL (?connection_limit=…) est respectée. Attention : PostgreSQL accepte 100
 * connexions par défaut (max_connections) : ne pas dépasser ce plafond.
 */
export function withPoolParams(url: string): string {
  try {
    const size = Math.max(5, Math.min(500, Number(process.env.DB_POOL_SIZE) || 40));
    const timeout = Math.max(5, Math.min(300, Number(process.env.DB_POOL_TIMEOUT) || 30));
    const u = new URL(url);
    if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', String(size));
    if (!u.searchParams.has('pool_timeout')) u.searchParams.set('pool_timeout', String(timeout));
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Pose `process.env.DATABASE_URL` pour que PrismaClient se construise.
 * Retourne l'état de configuration. À appeler tout au début du bootstrap,
 * avant que Nest n'instancie PrismaService.
 */
export function applyDatabaseEnv(): { configured: boolean; source: DbSource } {
  const { url, source } = resolveDatabaseUrl();
  if (url) {
    process.env.DATABASE_URL = withPoolParams(url);
    return { configured: true, source };
  }
  // Aucune base : placeholder pour permettre la construction du client.
  process.env.DATABASE_URL = PLACEHOLDER_DB_URL;
  return { configured: false, source: 'none' };
}

/**
 * Retourne le JWT secret : env → fichier → génère + persiste.
 * Appelé au bootstrap avant l'init de Nest.
 */
export function ensureJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  const runtime = loadRuntimeConfig();
  if (runtime.jwtSecret) return runtime.jwtSecret;

  // Premier boot sans env var : génère un secret fort et le persiste.
  const generated = randomBytes(48).toString('hex');
  const dir = dataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(runtimeFile(), JSON.stringify({ ...runtime, jwtSecret: generated }, null, 2), 'utf8');
  return generated;
}

/** Validation basique d'une URL de connexion PostgreSQL. */
export function isValidPostgresUrl(url: string): boolean {
  return /^postgres(ql)?:\/\/[^\s]+$/.test(url.trim());
}
