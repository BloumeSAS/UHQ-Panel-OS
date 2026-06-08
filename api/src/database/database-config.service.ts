import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  DbSource,
  isValidPostgresUrl,
  PLACEHOLDER_DB_URL,
  resolveDatabaseUrl,
  saveDatabaseUrl,
} from './db-config';
import { t } from '../common/utils/i18n';

const execFileAsync = promisify(execFile);

/** Ajoute un `connect_timeout` (s) à l'URL pour échouer vite si injoignable. */
function withConnectTimeout(url: string, seconds = 8): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has('connect_timeout')) {
      u.searchParams.set('connect_timeout', String(seconds));
    }
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Pilote la configuration de la base au runtime :
 *  - expose l'état (configurée ? quelle source ? base embarquée Docker ?),
 *  - teste + applique une URL externe saisie dans l'assistant.
 *
 * L'application de la nouvelle URL se fait par persistance + redémarrage du
 * process (récupéré par la restart-policy Docker/Coolify) : approche robuste
 * qui évite de « hot-swapper » le client Prisma en plein vol.
 */
@Injectable()
export class DatabaseConfigService {
  private readonly logger = new Logger(DatabaseConfigService.name);

  /** Base embarquée fournie par le compose auto-hébergé (heuristique : host `db`). */
  get isBundled(): boolean {
    const env = process.env.DATABASE_URL ?? '';
    return /@db:5432\//.test(env);
  }

  status(): { configured: boolean; source: DbSource; bundled: boolean } {
    const { url, source } = resolveDatabaseUrl();
    return { configured: !!url, source, bundled: this.isBundled };
  }

  /** Teste une URL externe en ouvrant une connexion jetable (timeout court). */
  async testConnection(url: string): Promise<void> {
    const client = new PrismaClient({ datasources: { db: { url: withConnectTimeout(url) } } });
    try {
      await client.$connect();
      await client.$queryRawUnsafe('SELECT 1');
    } finally {
      await client.$disconnect().catch(() => undefined);
    }
  }

  /** Vrai si l'erreur indique que la base de données cible n'existe pas. */
  private isDatabaseMissing(e: unknown): boolean {
    const msg = String((e as Error)?.message ?? e).toLowerCase();
    return (
      msg.includes('does not exist') ||
      msg.includes('p1003') ||
      msg.includes('3d000')
    );
  }

  /**
   * Crée la base de données cible si elle n'existe pas (nécessite le privilège
   * CREATEDB). Se connecte à la base d'admin `postgres` du même serveur.
   */
  private async createDatabase(url: string): Promise<void> {
    const u = new URL(url);
    const dbName = decodeURIComponent(u.pathname.replace(/^\//, ''));
    if (!dbName) throw new Error('Nom de base manquant');
    // Identifiant validé (anti-injection) avant interpolation dans CREATE DATABASE.
    if (!/^[A-Za-z0-9_]+$/.test(dbName)) {
      throw new Error(`Nom de base invalide: ${dbName}`);
    }
    const adminUrl = new URL(url);
    adminUrl.pathname = '/postgres';

    const client = new PrismaClient({
      datasources: { db: { url: withConnectTimeout(adminUrl.toString()) } },
    });
    try {
      await client.$connect();
      const rows = (await client.$queryRawUnsafe(
        `SELECT 1 FROM pg_database WHERE datname = '${dbName}'`,
      )) as unknown[];
      if (!Array.isArray(rows) || rows.length === 0) {
        this.logger.warn(`Base "${dbName}" absente — création…`);
        await client.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
      }
    } catch (e) {
      // Impossible de créer automatiquement → message explicite.
      throw new Error(
        `Création automatique de la base "${dbName}" impossible (accès à la base d'admin ` +
          `« postgres » refusé ou droit CREATEDB manquant). Créez-la manuellement, puis réessayez. ` +
          `Détail : ${String((e as Error)?.message ?? e)}`,
      );
    } finally {
      await client.$disconnect().catch(() => undefined);
    }
  }

  /**
   * Tente de contacter la base embarquée Docker (service `db` du compose).
   * Retourne l'URL si accessible, null sinon.
   */
  async probeBundled(): Promise<string | null> {
    const BUNDLED_URL = 'postgresql://uhq:uhqpanel_internal@db:5432/uhqpanel';
    try {
      await this.testConnection(BUNDLED_URL);
      return BUNDLED_URL;
    } catch {
      return null;
    }
  }

  /** Applique le schéma à la base cible (idempotent). */
  private async pushSchema(url: string): Promise<void> {
    await execFileAsync(
      'npx',
      ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'],
      { env: { ...process.env, DATABASE_URL: url }, shell: process.platform === 'win32' },
    );
  }

  /**
   * Configure une base externe : valide, teste, applique le schéma, persiste,
   * puis programme un redémarrage du process pour prendre en compte la nouvelle URL.
   */
  async configureExternal(url: string): Promise<void> {
    const trimmed = url.trim();
    if (!isValidPostgresUrl(trimmed)) {
      throw new Error(t('errors.invalidDbUrl'));
    }
    if (trimmed === PLACEHOLDER_DB_URL) throw new Error('URL invalide');

    this.logger.log('Test de la connexion à la base externe…');
    try {
      await this.testConnection(trimmed);
    } catch (e) {
      // Base inexistante → on tente de la créer puis on reteste.
      if (this.isDatabaseMissing(e)) {
        await this.createDatabase(trimmed);
        await this.testConnection(trimmed);
      } else {
        throw e;
      }
    }
    this.logger.log('Connexion OK — application du schéma…');
    await this.pushSchema(trimmed);
    saveDatabaseUrl(trimmed);
    this.logger.warn('Base configurée. Redémarrage du process pour appliquer la connexion…');

    // Laisse le temps de répondre au client avant de sortir (restart par Docker).
    setTimeout(() => process.exit(0), 800);
  }
}
