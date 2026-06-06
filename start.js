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

const args      = process.argv.slice(2);
const skipBuild = args.includes('--start');
const skipStart = args.includes('--build');

// Nixpacks/Coolify injecte NODE_ENV=production qui empêche l'install des
// devDependencies (nest-cli, typescript, vite…). On force development pour
// le build uniquement, puis on remet production au démarrage.
const buildEnv = { ...process.env, NODE_ENV: 'development', NPM_CONFIG_PRODUCTION: 'false' };

// ─── helpers ───────────────────────────────────────────────────────────────

function run(cmd, cwd, env) {
  console.log(`\n▶ ${cmd}  (${cwd})`);
  execSync(cmd, { cwd, stdio: 'inherit', env: env ?? process.env });
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
  // --legacy-peer-deps : contourne les conflits de peer deps entre packages
  run('npm install --prefer-offline --legacy-peer-deps', WEB, buildEnv);
  run('npm run build', WEB, buildEnv);

  header('Build API (NestJS)');
  run('npm install --prefer-offline --legacy-peer-deps', API, buildEnv);
  run('npx prisma generate --schema=prisma/schema.prisma', API, buildEnv);
  run('npm run build', API, buildEnv);
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

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig));
}
