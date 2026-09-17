import { ConsoleLogger, Injectable, LogLevel } from '@nestjs/common';
import { EventEmitter } from 'events';
import { FileAppender } from './file-appender';
import { requestIdStorage } from '../../common/utils/request-context';

export interface LogEntry {
  ts: number;
  level: LogLevel;
  context?: string;
  message: string;
  /** ID de corrélation de la requête en cours (cf. RequestIdInterceptor) — absent hors contexte HTTP (tâches planifiées, boot, etc.). */
  reqId?: string;
}

const MAX_ENTRIES = 2000;

// Ordre croissant de verbosité — un niveau ne s'affiche que s'il est >= au
// seuil configuré. `LOG_LEVEL` (env) permet de couper debug/verbose en prod
// sans changement de code ; défaut 'log' = comportement historique (tout sauf
// verbose/debug, qui étaient déjà rarement utilisés dans ce codebase).
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  verbose: 0,
  debug: 1,
  log: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};
const configuredLevel = (process.env.LOG_LEVEL as LogLevel) ?? 'log';
const MIN_LEVEL = LEVEL_PRIORITY[configuredLevel] ?? LEVEL_PRIORITY.log;

/**
 * Logger Nest qui conserve les dernières lignes en mémoire (buffer circulaire)
 * et les diffuse en temps réel (EventEmitter) pour le flux SSE du panel admin.
 * Étend ConsoleLogger : la sortie console habituelle est préservée.
 */
@Injectable()
export class RingBufferLogger extends ConsoleLogger {
  private static buffer: LogEntry[] = [];
  private static emitter = new EventEmitter();
  private static file = new FileAppender();

  static {
    // De nombreux abonnés SSE peuvent coexister.
    RingBufferLogger.emitter.setMaxListeners(0);
  }

  private push(level: LogLevel, message: unknown, context?: string): void {
    const ctx = context ?? this.context;
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    const reqId = requestIdStorage.getStore();
    const entry: LogEntry = { ts: Date.now(), level, context: ctx, message: msg, reqId };
    const buf = RingBufferLogger.buffer;
    buf.push(entry);
    if (buf.length > MAX_ENTRIES) buf.splice(0, buf.length - MAX_ENTRIES);
    RingBufferLogger.emitter.emit('log', entry);
    RingBufferLogger.file.write(level, ctx, msg, reqId);
  }

  private allowed(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= MIN_LEVEL;
  }

  log(message: unknown, context?: string): void {
    if (!this.allowed('log')) return;
    super.log(message as string, context as string);
    this.push('log', message, context);
  }
  warn(message: unknown, context?: string): void {
    if (!this.allowed('warn')) return;
    super.warn(message as string, context as string);
    this.push('warn', message, context);
  }
  error(message: unknown, stack?: string, context?: string): void {
    // 'error' ne doit jamais être coupé par LOG_LEVEL, quel que soit le seuil.
    super.error(message as string, stack as string, context as string);
    this.push('error', message, context);
  }
  debug(message: unknown, context?: string): void {
    if (!this.allowed('debug')) return;
    super.debug(message as string, context as string);
    this.push('debug', message, context);
  }
  verbose(message: unknown, context?: string): void {
    if (!this.allowed('verbose')) return;
    super.verbose(message as string, context as string);
    this.push('verbose', message, context);
  }

  /** Snapshot filtré du buffer (le plus récent en dernier). */
  static getEntries(opts: { level?: LogLevel; limit?: number; context?: string } = {}): LogEntry[] {
    let out = RingBufferLogger.buffer;
    if (opts.level) out = out.filter((e) => e.level === opts.level);
    if (opts.context) out = out.filter((e) => e.context === opts.context);
    const limit = Math.max(1, Math.min(MAX_ENTRIES, opts.limit ?? 500));
    return out.slice(-limit);
  }

  static onLog(cb: (e: LogEntry) => void): () => void {
    RingBufferLogger.emitter.on('log', cb);
    return () => RingBufferLogger.emitter.off('log', cb);
  }
}
