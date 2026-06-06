import * as fs from 'fs';
import * as path from 'path';
import { LogLevel } from '@nestjs/common';

function resolveLogDir(): string {
  if (process.env.LOG_DIR) return process.env.LOG_DIR;
  // Docker: /app/logs  — local monorepo: <api-root>/logs
  const dockerPath = '/app/logs';
  if (fs.existsSync('/app')) return dockerPath;
  return path.join(process.cwd(), 'logs');
}

function dateSuffix(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function formatLine(level: LogLevel, context: string | undefined, message: string): string {
  const ts = new Date().toISOString();
  const lvl = level.toUpperCase().padEnd(7);
  const ctx = context ? `[${context}] ` : '';
  return `${ts} ${lvl} ${ctx}${message}\n`;
}

export class FileAppender {
  private readonly dir: string;
  private initialized = false;

  constructor() {
    this.dir = resolveLogDir();
  }

  private init(): void {
    if (this.initialized) return;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      this.cleanup();
    } catch {
      // If we can't create the log dir, just disable file logging silently.
    }
    this.initialized = true;
  }

  private cleanup(): void {
    try {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      for (const name of fs.readdirSync(this.dir)) {
        if (!name.endsWith('.log')) continue;
        const full = path.join(this.dir, name);
        if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
      }
    } catch {
      // Non-fatal — best effort cleanup.
    }
  }

  write(level: LogLevel, context: string | undefined, message: string): void {
    this.init();
    const line = formatLine(level, context, message);
    const suffix = dateSuffix();
    try {
      fs.appendFileSync(path.join(this.dir, `combined-${suffix}.log`), line, 'utf8');
      if (level === 'error' || level === 'warn') {
        fs.appendFileSync(path.join(this.dir, `error-${suffix}.log`), line, 'utf8');
      }
    } catch {
      // Non-fatal — never crash the app because of a logging failure.
    }
  }
}
