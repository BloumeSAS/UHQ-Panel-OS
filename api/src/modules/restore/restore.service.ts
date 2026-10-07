import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ChildProcess, spawn } from 'child_process';
import { randomBytes } from 'crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  statfsSync,
  writeFileSync,
  chmodSync,
  truncateSync,
  openSync,
  readSync,
  closeSync,
} from 'fs';
import { join } from 'path';
import { createGunzip } from 'zlib';
import * as tar from 'tar';
import { PrismaService } from '../../database/prisma.service';
import { DatabaseConfigService } from '../../database/database-config.service';
import { dataDir, resolveDatabaseUrl } from '../../database/db-config';
import { t } from '../../common/utils/i18n';

const SINGLETON = 'singleton';
const TEMP_PORT = 54329;
/** Taille max d'un morceau d'upload (le client en envoie ~8 Mo : reste sous les limites des proxies/CDN). */
export const MAX_CHUNK_BYTES = 16 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 8 * 1024 ** 3;
const MAX_UNPACKED_BYTES = 40 * 1024 ** 3;
const MAX_ENTRIES = 200_000;
const RECOVERY_TIMEOUT_MS = 15 * 60_000;
const STALE_UPLOAD_MS = 30 * 60_000;

export type RestorePhase =
  | 'idle'
  | 'uploading'
  | 'analyzing'
  | 'extracting'
  | 'recovering'
  | 'restoring'
  | 'schema'
  | 'restarting'
  | 'error';

/** Erreur métier : `code` = clé i18n `errors.restore.<code>`, traduite au moment de la lecture du statut. */
class RestoreError extends Error {
  constructor(
    public readonly code: string,
    public readonly detail?: string,
  ) {
    super(code);
  }
}

interface Upload {
  id: string;
  filename: string;
  size: number;
  received: number;
  file: string;
  touchedAt: number;
}

interface Job {
  phase: RestorePhase;
  error?: { code: string; detail?: string };
  stats?: { users: number; accounts: number; proxies: number };
  restoredBytes: number;
}

/**
 * Restauration d'une sauvegarde PostgreSQL complète depuis l'assistant d'installation.
 *
 * Archive attendue : un `.tar.gz` du dossier de données PostgreSQL 16 (PGDATA — exemple :
 * l'export d'un volume Coolify/Docker). On ne FAIT PAS confiance à son contenu :
 *   - extraction stricte (fichiers/dossiers uniquement, chemins confinés, quotas),
 *   - configuration PostgreSQL remplacée par la nôtre (aucune config de l'archive n'est lue),
 *   - instance temporaire sans réseau (socket Unix dans un dossier privé),
 *   - restauration ATOMIQUE dans la base configurée (`pg_dump | psql --single-transaction`) :
 *     en cas d'échec, la base cible est inchangée.
 * Verrouillé dès que l'installation est terminée (même règle que la création du 1er admin).
 */
@Injectable()
export class RestoreService implements OnModuleInit {
  private readonly logger = new Logger(RestoreService.name);
  private upload: Upload | null = null;
  private job: Job = { phase: 'idle', restoredBytes: 0 };
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dbConfig: DatabaseConfigService,
  ) {}

  private get root(): string {
    return join(dataDir(), 'restore-tmp');
  }

  onModuleInit() {
    // Reste d'un redémarrage en plein travail : on nettoie.
    try {
      rmSync(this.root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  /** Vrai pendant l'upload ou le traitement : bloque la création manuelle du 1er admin. */
  isActive(): boolean {
    return this.busy || !!this.upload;
  }

  private fail(status: HttpStatus, code: string, detail?: string): never {
    throw new HttpException(t(`errors.restore.${code}`) + (detail ? ` (${detail})` : ''), status);
  }

  /** Autorisé uniquement base configurée + installation NON terminée. */
  async assertAllowed(): Promise<void> {
    if (!this.dbConfig.status().configured) this.fail(HttpStatus.CONFLICT, 'dbNotConfigured');
    const meta = await this.prisma.appMeta.findUnique({ where: { id: SINGLETON } });
    const adminCount = await this.prisma.panelUser.count({ where: { role: 'ADMIN' } });
    if (meta?.setupCompleted && adminCount > 0) {
      this.fail(HttpStatus.FORBIDDEN, 'locked');
    }
  }

  // ───────────────────────── Upload par morceaux ─────────────────────────

  async begin(filename: string, size: number) {
    await this.assertAllowed();
    if (this.busy) this.fail(HttpStatus.CONFLICT, 'busy');
    if (!Number.isFinite(size) || size <= 0) this.fail(HttpStatus.BAD_REQUEST, 'badSize');
    if (size > MAX_ARCHIVE_BYTES) this.fail(HttpStatus.PAYLOAD_TOO_LARGE, 'tooLarge');

    this.discardUpload();
    rmSync(this.root, { recursive: true, force: true });
    mkdirSync(this.root, { recursive: true, mode: 0o700 });

    // Place disque : archive + données décompressées (≈ 2 à 3×) + marge.
    try {
      const fs = statfsSync(this.root);
      const free = Number(fs.bavail) * Number(fs.bsize);
      if (free < size * 3) {
        this.fail(507 as HttpStatus, 'noSpace', `${Math.round(free / 1e6)} Mo`);
      }
    } catch (e) {
      if (e instanceof HttpException) throw e;
    }

    const id = randomBytes(16).toString('hex');
    const file = join(this.root, `${id}.tar.gz`);
    writeFileSync(file, '', { mode: 0o600 });
    this.upload = {
      id,
      filename: String(filename || 'backup').slice(0, 200),
      size,
      received: 0,
      file,
      touchedAt: Date.now(),
    };
    this.job = { phase: 'uploading', restoredBytes: 0 };
    return { uploadId: id, received: 0, chunkSize: 8 * 1024 * 1024 };
  }

  private getUpload(id: string): Upload {
    if (!/^[a-f0-9]{32}$/.test(id) || !this.upload || this.upload.id !== id) {
      this.fail(HttpStatus.NOT_FOUND, 'unknownUpload');
    }
    return this.upload;
  }

  /** Ajoute un morceau à la position attendue (reprise après erreur réseau : l'offset sert de contrôle). */
  async appendChunk(id: string, offset: number, req: NodeJS.ReadableStream & { headers: any }) {
    await this.assertAllowed();
    const up = this.getUpload(id);
    if (this.busy) this.fail(HttpStatus.CONFLICT, 'busy');
    if (offset !== up.received) {
      throw new HttpException(
        { message: t('errors.restore.badOffset'), received: up.received },
        HttpStatus.CONFLICT,
      );
    }
    const declared = Number(req.headers['content-length']);
    if (!Number.isFinite(declared) || declared <= 0 || declared > MAX_CHUNK_BYTES) {
      this.fail(HttpStatus.PAYLOAD_TOO_LARGE, 'badChunk');
    }
    if (up.received + declared > up.size) this.fail(HttpStatus.BAD_REQUEST, 'badChunk');

    let written = 0;
    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(up.file, { flags: 'a', mode: 0o600 });
      req.on('data', (c: Buffer) => {
        written += c.length;
        if (written > declared) {
          (req as any).destroy?.();
          out.destroy();
          reject(new HttpException(t('errors.restore.badChunk'), HttpStatus.PAYLOAD_TOO_LARGE));
        }
      });
      req.on('error', reject);
      req.on('aborted', () => reject(new Error('aborted')));
      out.on('error', reject);
      out.on('finish', () => resolve());
      req.pipe(out);
    }).catch((e) => {
      // Morceau partiel : on retronque à la dernière position valide.
      try {
        if (statSync(up.file).size !== up.received) truncateSync(up.file, up.received);
      } catch {
        /* ignore */
      }
      throw e instanceof HttpException ? e : new HttpException(t('errors.restore.uploadFailed'), 400);
    });
    if (written !== declared) {
      this.fail(HttpStatus.BAD_REQUEST, 'badChunk');
    }
    up.received += written;
    up.touchedAt = Date.now();
    return { received: up.received };
  }

  async finish(id: string) {
    await this.assertAllowed();
    const up = this.getUpload(id);
    if (this.busy) this.fail(HttpStatus.CONFLICT, 'busy');
    if (up.received !== up.size) this.fail(HttpStatus.BAD_REQUEST, 'incomplete');
    this.busy = true;
    this.job = { phase: 'analyzing', restoredBytes: 0 };
    void this.run(up).finally(() => {
      this.busy = false;
    });
    return { started: true };
  }

  cancel(id: string) {
    if (this.busy) this.fail(HttpStatus.CONFLICT, 'busy');
    if (this.upload && this.upload.id === id) this.discardUpload();
    this.job = { phase: 'idle', restoredBytes: 0 };
    return { cancelled: true };
  }

  private discardUpload() {
    this.upload = null;
    try {
      rmSync(this.root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  /** Statut courant (traduit dans la langue de la requête qui l'interroge). */
  status() {
    if (this.upload && !this.busy && Date.now() - this.upload.touchedAt > STALE_UPLOAD_MS) {
      this.discardUpload();
      this.job = { phase: 'idle', restoredBytes: 0 };
    }
    const j = this.job;
    return {
      phase: j.phase,
      busy: this.busy,
      uploaded: this.upload?.received ?? 0,
      size: this.upload?.size ?? 0,
      restoredBytes: j.restoredBytes,
      stats: j.stats ?? null,
      error: j.error
        ? { code: j.error.code, message: t(`errors.restore.${j.error.code}`) + (j.error.detail ? ` — ${j.error.detail}` : '') }
        : null,
    };
  }

  // ───────────────────────────── Traitement ──────────────────────────────

  private async run(up: Upload) {
    const work = join(this.root, 'work');
    const pgdata = join(work, 'pgdata');
    const sock = join(work, 'sock');
    let pg: ChildProcess | null = null;
    try {
      mkdirSync(pgdata, { recursive: true, mode: 0o700 });
      mkdirSync(sock, { recursive: true, mode: 0o700 });

      this.setPhase('analyzing');
      const strip = await this.analyze(up.file);

      this.setPhase('extracting');
      await this.extract(up.file, pgdata, strip);
      rmSync(up.file, { force: true }); // libère la place avant la suite
      this.prepareDataDir(pgdata);
      const version = readFileSync(join(pgdata, 'PG_VERSION'), 'utf8').trim();
      if (version !== '16') throw new RestoreError('badVersion', `PostgreSQL ${version}`);

      this.setPhase('recovering');
      const conf = this.writeConfig(work, sock);
      const role = await this.bootstrapRole(pgdata, conf);
      const started = this.startPostgres(pgdata, conf);
      pg = started.child;
      await this.waitReady(sock, role, started);

      const source = await this.findPanelDatabase(sock, role);
      const stats = await this.readStats(sock, role, source);

      this.setPhase('restoring');
      await this.copyDatabase(sock, role, source);
      this.job.stats = stats;

      await this.stopPostgres(pg);
      pg = null;

      this.setPhase('schema');
      const target = resolveDatabaseUrl().url;
      if (target) {
        try {
          await this.dbConfig.pushSchema(target);
        } catch (e) {
          // Le schéma sera réappliqué au démarrage (CMD du conteneur).
          this.logger.warn(`prisma db push après restauration : ${(e as Error).message}`);
        }
      }

      this.setPhase('restarting');
      this.logger.warn('Restauration terminée — redémarrage du process.');
      setTimeout(() => process.exit(0), 2500);
    } catch (e) {
      const err =
        e instanceof RestoreError ? e : new RestoreError('failed', String((e as Error)?.message ?? e).slice(0, 400));
      this.logger.error(`Restauration échouée : ${err.code} ${err.detail ?? ''}`);
      this.job = { ...this.job, phase: 'error', error: { code: err.code, detail: err.detail } };
      this.upload = null;
    } finally {
      if (pg) await this.stopPostgres(pg).catch(() => undefined);
      try {
        rmSync(this.root, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  private setPhase(phase: RestorePhase) {
    this.job.phase = phase;
  }

  /**
   * 1re passe sur l'archive : repère `PG_VERSION` (nombre de dossiers à retirer), refuse les
   * archives piégées (trop d'entrées, taille décompressée démesurée, chemins hors dossier).
   */
  private analyze(file: string): Promise<number> {
    return new Promise((resolve, reject) => {
      let entries = 0;
      let total = 0;
      let strip: number | null = null;
      const head = Buffer.alloc(2);
      try {
        const fd = openSync(file, 'r');
        readSync(fd, head, 0, 2, 0);
        closeSync(fd);
      } catch {
        return reject(new RestoreError('notArchive'));
      }
      if (head[0] !== 0x1f || head[1] !== 0x8b) return reject(new RestoreError('notArchive'));

      const parser = tar.t({
        onReadEntry: (entry: any) => {
          entries++;
          total += entry.size ?? 0;
          if (entries > MAX_ENTRIES || total > MAX_UNPACKED_BYTES) {
            reject(new RestoreError('tooLarge'));
            (parser as any).abort?.(new Error('limit'));
            return;
          }
          const parts = String(entry.path).split('/').filter((p: string) => p && p !== '.');
          if (parts[parts.length - 1] === 'PG_VERSION' && entry.type === 'File') {
            const depth = parts.length - 1;
            if (strip === null || depth < strip) strip = depth;
          }
        },
      } as any);
      createReadStream(file)
        .on('error', () => reject(new RestoreError('notArchive')))
        .pipe(parser as any)
        .on('error', () => reject(new RestoreError('notArchive')))
        .on('end', () => {
          if (entries === 0) return reject(new RestoreError('notArchive'));
          if (strip === null) return reject(new RestoreError('notPgdata'));
          if (strip > 3) return reject(new RestoreError('notPgdata'));
          resolve(strip);
        });
    });
  }

  private async extract(file: string, dest: string, strip: number) {
    let skipped = 0;
    await tar.x({
      file,
      cwd: dest,
      strip,
      preservePaths: false,
      noChmod: false,
      // fichiers et dossiers uniquement : pas de liens (symboliques/durs), périphériques, FIFO…
      filter: (path: string, entry: any) => {
        const ok = entry.type === 'File' || entry.type === 'Directory';
        if (!ok) skipped++;
        return ok;
      },
    } as any);
    if (skipped) this.logger.warn(`${skipped} entrée(s) non standard ignorée(s) dans l'archive`);
    if (!existsSync(join(dest, 'PG_VERSION'))) throw new RestoreError('notPgdata');
  }

  /** Retire tout ce qui pourrait influencer le démarrage (config, signaux de réplication, pid). */
  private prepareDataDir(pgdata: string) {
    chmodSync(pgdata, 0o700);
    for (const f of [
      'postmaster.pid',
      'postmaster.opts',
      'postgresql.auto.conf',
      'recovery.signal',
      'standby.signal',
      'recovery.conf',
      'core',
    ]) {
      rmSync(join(pgdata, f), { force: true });
    }
    for (const f of ['postgresql.conf', 'pg_hba.conf', 'pg_ident.conf']) {
      rmSync(join(pgdata, f), { force: true });
    }
    // postgresql.auto.conf doit exister vide pour certaines versions : on le recrée vide.
    writeFileSync(join(pgdata, 'postgresql.auto.conf'), '', { mode: 0o600 });
  }

  /** Config PostgreSQL à NOUS (aucune lecture de celle de l'archive). */
  private writeConfig(work: string, sock: string): string {
    const cfgDir = join(work, 'cfg');
    mkdirSync(cfgDir, { recursive: true, mode: 0o700 });
    const hba = join(cfgDir, 'pg_hba.conf');
    const ident = join(cfgDir, 'pg_ident.conf');
    const conf = join(cfgDir, 'postgresql.conf');
    writeFileSync(hba, 'local all all trust\n', { mode: 0o600 });
    writeFileSync(ident, '', { mode: 0o600 });
    writeFileSync(
      conf,
      [
        `hba_file = '${hba}'`,
        `ident_file = '${ident}'`,
        `listen_addresses = ''`,
        `port = ${TEMP_PORT}`,
        `unix_socket_directories = '${sock}'`,
        `unix_socket_permissions = 0700`,
        `max_connections = 20`,
        `shared_buffers = 128MB`,
        `fsync = off`,
        `full_page_writes = off`,
        `synchronous_commit = off`,
        `archive_mode = off`,
        `ssl = off`,
        `logging_collector = off`,
        `log_min_messages = warning`,
        `max_wal_senders = 0`,
        `wal_level = minimal`,
        `shared_preload_libraries = ''`,
        '',
      ].join('\n'),
      { mode: 0o600 },
    );
    return conf;
  }

  private cleanEnv(): NodeJS.ProcessEnv {
    return { PATH: process.env.PATH, HOME: process.env.HOME ?? '/tmp', LANG: 'C', LC_ALL: 'C' };
  }

  /** Nom du rôle superutilisateur du cluster (oid 10), variable selon l'installation d'origine. */
  private bootstrapRole(pgdata: string, conf: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const p = spawn(
        'postgres',
        ['--single', '-D', pgdata, '-c', `config_file=${conf}`, 'postgres'],
        { env: this.cleanEnv(), stdio: ['pipe', 'pipe', 'pipe'] },
      );
      let out = '';
      let err = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (err += d));
      const timer = setTimeout(() => p.kill('SIGKILL'), RECOVERY_TIMEOUT_MS);
      p.on('error', () => reject(new RestoreError('noPostgres')));
      p.on('close', () => {
        clearTimeout(timer);
        const m = out.match(/rolname = "([A-Za-z0-9_]{1,63})"/);
        if (m) return resolve(m[1]);
        reject(new RestoreError('pgStartFailed', this.tail(err || out)));
      });
      p.stdin.write('select rolname from pg_authid where oid = 10;\n');
      p.stdin.end();
    });
  }

  private tail(s: string, n = 300): string {
    return s.trim().split('\n').slice(-3).join(' | ').slice(-n);
  }

  private startPostgres(pgdata: string, conf: string) {
    const child = spawn('postgres', ['-D', pgdata, '-c', `config_file=${conf}`], {
      env: this.cleanEnv(),
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const state = { log: '', exited: false as boolean, spawnError: false as boolean };
    child.stderr?.on('data', (d) => {
      state.log = (state.log + d).slice(-4000);
    });
    child.on('exit', () => (state.exited = true));
    child.on('error', () => {
      state.exited = true;
      state.spawnError = true;
    });
    return { child, state };
  }

  private async waitReady(
    sock: string,
    role: string,
    started: { child: ChildProcess; state: { log: string; exited: boolean; spawnError: boolean } },
  ) {
    const deadline = Date.now() + RECOVERY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (started.state.spawnError) throw new RestoreError('noPostgres');
      if (started.state.exited) throw new RestoreError('pgStartFailed', this.tail(started.state.log));
      const r = await this.run1('pg_isready', ['-h', sock, '-p', String(TEMP_PORT), '-U', role, '-d', 'postgres']);
      if (r.code === 0) return;
      await new Promise((res) => setTimeout(res, 1000));
    }
    throw new RestoreError('pgStartTimeout');
  }

  private run1(cmd: string, args: string[], input?: string): Promise<{ code: number; out: string; err: string }> {
    return new Promise((resolve) => {
      const p = spawn(cmd, args, { env: this.cleanEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (err += d));
      p.on('error', () => resolve({ code: 127, out, err: 'spawn failed' }));
      p.on('close', (code) => resolve({ code: code ?? 1, out, err }));
      p.stdin.end(input ?? '');
    });
  }

  private psqlSource(sock: string, role: string, db: string, sql: string) {
    return this.run1('psql', [
      '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
      '-h', sock, '-p', String(TEMP_PORT), '-U', role, '-d', db, '-c', sql,
    ]);
  }

  /** Base du cluster qui contient les tables du panel (le nom d'origine peut différer). */
  private async findPanelDatabase(sock: string, role: string): Promise<string> {
    const list = await this.psqlSource(
      sock, role, 'postgres',
      'select datname from pg_database where not datistemplate and datallowconn order by datname',
    );
    if (list.code !== 0) throw new RestoreError('failed', this.tail(list.err));
    const names = list.out.split('\n').map((s) => s.trim()).filter(Boolean);
    for (const name of names) {
      const r = await this.psqlSource(
        sock, role, name,
        `select (to_regclass('public."PanelUser"') is not null and to_regclass('public."UserProxy"') is not null)`,
      );
      if (r.code === 0 && r.out.trim() === 't') return name;
    }
    throw new RestoreError('noPanelData');
  }

  private async readStats(sock: string, role: string, db: string) {
    const r = await this.psqlSource(
      sock, role, db,
      `select (select count(*) from "PanelUser") || ',' || (select count(*) from "UserProxy") || ',' || coalesce((select count(*) from "BackendProxy"),0)`,
    );
    const [users, accounts, proxies] = (r.out.trim().split(',') || []).map((n) => Number(n) || 0);
    return { users: users ?? 0, accounts: accounts ?? 0, proxies: proxies ?? 0 };
  }

  /** Variables libpq de la base cible (sans mot de passe sur la ligne de commande). */
  private targetEnv(): NodeJS.ProcessEnv {
    const url = resolveDatabaseUrl().url;
    if (!url) throw new RestoreError('dbNotConfigured');
    const u = new URL(url);
    const env: NodeJS.ProcessEnv = {
      ...this.cleanEnv(),
      PGHOST: u.searchParams.get('host') || u.hostname,
      PGPORT: u.port || '5432',
      PGUSER: decodeURIComponent(u.username),
      PGPASSWORD: decodeURIComponent(u.password),
      PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'postgres',
      PGCONNECT_TIMEOUT: '15',
    };
    const ssl = u.searchParams.get('sslmode');
    if (ssl && /^[a-z-]+$/.test(ssl)) env.PGSSLMODE = ssl;
    return env;
  }

  /**
   * pg_dump (instance temporaire) → psql (base cible) en UNE transaction :
   * le schéma `public` cible est remplacé par celui de la sauvegarde.
   */
  private copyDatabase(sock: string, role: string, db: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const dump = spawn(
        'pg_dump',
        [
          '-h', sock, '-p', String(TEMP_PORT), '-U', role, '-d', db,
          '--no-owner', '--no-privileges', '--no-comments', '--no-tablespaces',
          '--no-publications', '--no-subscriptions', '--no-security-labels',
        ],
        { env: this.cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] },
      );
      const load = spawn(
        'psql',
        [
          '-X', '-q', '-v', 'ON_ERROR_STOP=1', '--single-transaction',
          '-c', 'DROP SCHEMA IF EXISTS public CASCADE',
          '-c', 'CREATE SCHEMA public',
          '-f', '-',
        ],
        { env: this.targetEnv(), stdio: ['pipe', 'ignore', 'pipe'] },
      );
      let dumpErr = '';
      let loadErr = '';
      let dumpCode: number | null = null;
      let loadCode: number | null = null;
      dump.stderr.on('data', (d) => (dumpErr = (dumpErr + d).slice(-4000)));
      load.stderr.on('data', (d) => (loadErr = (loadErr + d).slice(-4000)));
      dump.stdout.on('data', (c: Buffer) => (this.job.restoredBytes += c.length));
      // EOF envoyé à psql SEULEMENT si pg_dump a réussi : un dump tronqué ne doit jamais être commité.
      dump.stdout.pipe(load.stdin, { end: false });
      load.stdin.on('error', () => undefined); // EPIPE si psql s'arrête avant la fin
      const settle = () => {
        if (dumpCode === null || loadCode === null) return;
        if (loadCode !== 0) return reject(new RestoreError('restoreFailed', this.tail(loadErr)));
        if (dumpCode !== 0) return reject(new RestoreError('restoreFailed', this.tail(dumpErr)));
        resolve();
      };
      dump.on('error', () => reject(new RestoreError('noPostgres')));
      load.on('error', () => reject(new RestoreError('noPostgres')));
      dump.on('close', (c) => {
        dumpCode = c ?? 1;
        if (dumpCode === 0) load.stdin.end();
        else load.kill('SIGTERM');
        settle();
      });
      load.on('close', (c) => {
        loadCode = c ?? 1;
        if (loadCode !== 0) dump.kill('SIGTERM');
        settle();
      });
    });
  }

  private stopPostgres(child: ChildProcess): Promise<void> {
    return new Promise((resolve) => {
      if (child.exitCode !== null || child.killed) return resolve();
      const kill = setTimeout(() => child.kill('SIGKILL'), 60_000);
      child.once('exit', () => {
        clearTimeout(kill);
        resolve();
      });
      child.kill('SIGINT'); // arrêt « fast »
    });
  }
}
