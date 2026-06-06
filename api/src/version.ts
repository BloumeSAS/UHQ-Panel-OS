import { readFileSync } from 'fs';
import { join } from 'path';

function readVersion(): string {
  // process.cwd() = /app (WORKDIR Docker) → /app/package.json
  // Fallback sur npm_package_version si lancé via npm (dev local)
  const candidates = [join(process.cwd(), 'package.json'), join(__dirname, '../package.json')];
  for (const p of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(p, 'utf-8')) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch { /* next */ }
  }
  return process.env.npm_package_version ?? '0.0.0';
}

export const APP_VERSION = readVersion();
