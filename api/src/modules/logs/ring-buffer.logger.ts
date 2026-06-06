import { ConsoleLogger, Injectable, LogLevel } from '@nestjs/common';
import { EventEmitter } from 'events';
import { FileAppender } from './file-appender';

export interface LogEntry {
  ts: number;
  level: LogLevel;
  context?: string;
  message: string;
}

const MAX_ENTRIES = 2000;

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
    const entry: LogEntry = { ts: Date.now(), level, context: ctx, message: msg };
    const buf = RingBufferLogger.buffer;
    buf.push(entry);
    if (buf.length > MAX_ENTRIES) buf.splice(0, buf.length - MAX_ENTRIES);
    RingBufferLogger.emitter.emit('log', entry);
    RingBufferLogger.file.write(level, ctx, msg);
  }

  log(message: unknown, context?: string): void {
    super.log(message as string, context as string);
    this.push('log', message, context);
  }
  warn(message: unknown, context?: string): void {
    super.warn(message as string, context as string);
    this.push('warn', message, context);
  }
  error(message: unknown, stack?: string, context?: string): void {
    super.error(message as string, stack as string, context as string);
    this.push('error', message, context);
  }
  debug(message: unknown, context?: string): void {
    super.debug(message as string, context as string);
    this.push('debug', message, context);
  }
  verbose(message: unknown, context?: string): void {
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
