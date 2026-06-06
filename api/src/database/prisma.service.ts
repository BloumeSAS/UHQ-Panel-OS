import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * NestJS wrapper around PrismaClient — mirrors the Python `PrismaPool`:
 *  - lazy/idempotent connect()
 *  - ensureConnection() helper
 *  - withRetry() for deadlock / "connection closed" transient errors
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private connecting: Promise<void> | null = null;
  private connected = false;

  async onModuleInit(): Promise<void> {
    // Connexion non-fatale : si la base n'est pas (encore) configurée,
    // l'app démarre quand même pour servir l'assistant de configuration.
    try {
      await this.connect();
    } catch (err) {
      this.logger.warn(
        `Démarrage sans base de données connectée (${String(
          (err as Error)?.message ?? err,
        )}). L'assistant de configuration est disponible.`,
      );
    }
  }

  /** La base est-elle connectée et opérationnelle ? */
  get isConnected(): boolean {
    return this.connected;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connected) {
      await this.$disconnect();
      this.connected = false;
      this.logger.log('Prisma disconnected.');
    }
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    if (!this.connecting) {
      this.connecting = (async () => {
        try {
          await this.$connect();
          this.connected = true;
          this.logger.log('Prisma connected to Database.');
        } catch (err) {
          this.logger.error(`Failed to connect Prisma: ${err}`);
          throw err;
        } finally {
          this.connecting = null;
        }
      })();
    }
    await this.connecting;
  }

  async ensureConnection(): Promise<void> {
    if (!this.connected) {
      this.logger.warn('Prisma disconnected detected. Reconnecting...');
      await this.connect();
    }
  }

  /**
   * Retry wrapper for transient DB failures (deadlock, closed connection).
   * Mirrors Python `PrismaPool.with_retry`.
   */
  async withRetry<T>(
    fn: () => Promise<T>,
    options: { maxRetries?: number; delay?: number } = {},
  ): Promise<T> {
    const maxRetries = options.maxRetries ?? 3;
    const baseDelay = options.delay ?? 500;
    let lastError: unknown;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (e) {
        lastError = e;
        const msg = String((e as Error)?.message ?? e).toLowerCase();
        const retriable =
          msg.includes('deadlock') ||
          msg.includes('connectorerror') ||
          msg.includes('closed');
        if (!retriable) throw e;
        const wait = baseDelay * 2 ** attempt;
        this.logger.warn(
          `DB Conflict/Deadlock detected. Attempt ${attempt + 1}/${maxRetries} – retrying in ${wait}ms`,
        );
        await new Promise((r) => setTimeout(r, wait));
        try {
          await this.ensureConnection();
        } catch {
          /* swallow */
        }
      }
    }
    this.logger.error(`DB Operation failed after ${maxRetries} attempts: ${lastError}`);
    throw lastError;
  }
}
