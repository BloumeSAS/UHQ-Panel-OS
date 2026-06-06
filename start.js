#!/usr/bin/env node
// UHQ Panel OS — build & start
// Usage:
//   node start.js          → build web + api, puis démarre
//   node start.js --start  → démarre sans rebuilder (dist déjà présent)
//   node start.js --build  → build uniquement, sans démarrer

'use strict';

const { execSync, spawn } = require('child_process');
const { existsSync, mkdirSync } = require('fs');
const { join, resolve } = require('path');

const ROOT = resolve(__dirname);
const WEB  = join(ROOT, 'web');
const API  = join(ROOT, 'api');
const DIST = join(API, 'dist');

const args     = process.argv.slice(2);
const skipBuild = args.includes('--start');
const skipStart = args.includes('--build');

// ─── helpers ───────────────────────────────────────────────────────────────

function run(cmd, cwd) {
  console.log(`\n▶ ${cmd}  (${cwd})`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function header(msg) {
  const line = '─'.repeat(msg.length + 4);
  console.log(`\n┌${line}┐`);
  console.log(`│  ${msg}  │`);
  console.log(`└${line}┘`);
}

// ─── build ─────────────────────────────────────────────────────────────────

if (!skipBuild) {
  header('Build web (Vite)');
  run('npm install --prefer-offline', WEB);
  run('npm run build', WEB);

  header('Build API (NestJS)');
  run('npm install --prefer-offline', API);
  run('npx prisma generate --schema=prisma/schema.prisma', API);
  run('npm run build', API);
}

if (skipStart) {
  console.log('\n✔ Build terminé.');
  process.exit(0);
}

// ─── pré-vérification ──────────────────────────────────────────────────────

if (!existsSync(join(DIST, 'main.js'))) {
  console.error('\n✖ api/dist/main.js introuvable — lancez d\'abord : node start.js --build');
  process.exit(1);
}

// Dossier data (runtime.json, backups…)
const dataDir = join(ROOT, 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

// ─── prisma db push (non bloquant) ─────────────────────────────────────────

header('Prisma db push');
try {
  execSync(
    'npx prisma db push --schema=prisma/schema.prisma --skip-generate --accept-data-loss',
    { cwd: API, stdio: 'inherit', timeout: 30_000 },
  );
} catch {
  console.warn('\n⚠  db push ignoré (base non encore configurée — normal au 1er boot).');
}

// ─── démarrage ─────────────────────────────────────────────────────────────

header('Démarrage UHQ Panel OS');

const env = {
  ...process.env,
  // Ports par défaut — tous configurables via le panel
  PROXY_HOST: process.env.PROXY_HOST ?? '0.0.0.0',
  PROXY_PORT: process.env.PROXY_PORT ?? '990',
  API_PORT:   process.env.API_PORT   ?? '8000',
  DATA_DIR:   process.env.DATA_DIR   ?? dataDir,
  NODE_ENV:   'production',
};

const child = spawn(process.execPath, [join(DIST, 'main.js')], {
  cwd: API,
  env,
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});

// Propagation des signaux pour un arrêt propre (Ctrl+C, Docker stop…)
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    child.kill(sig);
  });
}
