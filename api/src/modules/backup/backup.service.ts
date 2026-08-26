import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from '../../config/settings.service';
import { JobCoordinatorService } from '../../common/job-coordinator.service';
import { ProxyServerService } from '../proxy-engine/proxy-server.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import * as fs from 'fs';
import * as path from 'path';
import { PassThrough } from 'stream';
import { pipeline } from 'stream/promises';
import { fetch } from 'undici';
import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

/** Nombre de lignes lues par page pour les grosses tables (pagination cursor). */
const BACKUP_PAGE_SIZE = 5000;

// Fenêtre "calme" attendue avant une sauvegarde AUTOMATIQUE (planifiée) —
// pas appliqué au déclenchement manuel, qui reste immédiat (intention
// explicite de l'admin). Seuil volontairement conservateur : mieux vaut
// retarder un peu une sauvegarde planifiée que la faire tourner en même
// temps qu'un pic de trafic + scraper/checker (cause des crashes en prod).
const BACKUP_MAX_ACTIVE_THREADS = 100;
const BACKUP_QUIET_WINDOW_MAX_WAIT_MS = 20 * 60_000;
const BACKUP_QUIET_WINDOW_POLL_MS = 15_000;

const bigIntSafe = (v: unknown): unknown => (typeof v === 'bigint' ? v.toString() : v);

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  private readonly jobName = 'database-backup-cron';
  // Déclenchement manuel : suivi en mémoire pour le polling du panel (pas de
  // persistance nécessaire, un redémarrage remet simplement running=false).
  private manualRun: { running: boolean; startedAt?: number; finishedAt?: number; success?: boolean; filename?: string; error?: string } = {
    running: false,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly jobs: JobCoordinatorService,
    private readonly engine: ProxyServerService,
  ) {}

  /**
   * Attend une fenêtre "calme" avant une sauvegarde AUTOMATIQUE : scraper et
   * checker à l'arrêt, et charge proxy raisonnablement basse. Abandonne après
   * `BACKUP_QUIET_WINDOW_MAX_WAIT_MS` et lance quand même (mieux vaut une
   * sauvegarde en retard/sous charge qu'une sauvegarde qui saute).
   */
  private async waitForQuietWindow(): Promise<void> {
    const deadline = Date.now() + BACKUP_QUIET_WINDOW_MAX_WAIT_MS;
    let waited = false;
    for (;;) {
      const busyWithJobs = this.jobs.isAnyRunning();
      const activeThreads = Array.from(this.engine.getActiveThreads().values()).reduce((a, b) => a + b, 0);
      const busyWithTraffic = activeThreads > BACKUP_MAX_ACTIVE_THREADS;
      if (!busyWithJobs && !busyWithTraffic) break;
      if (Date.now() >= deadline) {
        this.logger.warn(
          `Fenêtre calme non trouvée après ${Math.round(BACKUP_QUIET_WINDOW_MAX_WAIT_MS / 60_000)}min — sauvegarde planifiée lancée quand même (jobs actifs: ${busyWithJobs}, threads actifs: ${activeThreads}).`,
        );
        return;
      }
      if (!waited) {
        this.logger.log(
          `Sauvegarde planifiée en attente d'une fenêtre calme (jobs actifs: ${busyWithJobs}, threads actifs: ${activeThreads}/${BACKUP_MAX_ACTIVE_THREADS})...`,
        );
        waited = true;
      }
      await new Promise((r) => setTimeout(r, BACKUP_QUIET_WINDOW_POLL_MS));
    }
    if (waited) this.logger.log('Fenêtre calme trouvée — sauvegarde planifiée démarre.');
  }

  async onModuleInit() {
    // Schedule cron job on startup
    this.reschedule();
  }

  /**
   * Reschedules the cron backup job based on current database settings.
   */
  reschedule() {
    // Stop and delete existing cron job if any
    try {
      const existingJob = this.schedulerRegistry.getCronJob(this.jobName);
      if (existingJob) {
        existingJob.stop();
        this.schedulerRegistry.deleteCronJob(this.jobName);
        this.logger.log('Stopped and cleared existing backup cron job.');
      }
    } catch (e) {
      // Ignored
    }

    const enabled = this.settings.getBool('backupDatabaseEnabled');
    if (!enabled) {
      this.logger.log('Database backups are currently disabled in settings.');
      return;
    }

    const cronExpr = this.settings.get('backupIntervalCron') || '0 0 * * *';
    const storageType = this.settings.get('backupStorageType') || 'local';
    try {
      const job = new CronJob(cronExpr, async () => {
        const startedAt = Date.now();
        this.logger.log(`Triggering scheduled database backup (storage: ${storageType})...`);
        try {
          await this.waitForQuietWindow();
          const filename = await this.runBackup();
          this.logger.log(`Scheduled backup finished in ${Date.now() - startedAt}ms: ${filename}`);
        } catch (err) {
          this.logger.error(`Scheduled backup failed after ${Date.now() - startedAt}ms: ${err.message}`);
        }
      });

      this.schedulerRegistry.addCronJob(this.jobName, job);
      job.start();
      const nextRun = job.nextDate?.()?.toJSDate?.() ?? null;
      this.logger.log(
        `Scheduled database backup registered with cron "${cronExpr}" (storage: ${storageType})${
          nextRun ? `, next run at ${nextRun.toISOString()}` : ''
        }.`,
      );
    } catch (err) {
      this.logger.error(`Failed to register backup cron expression "${cronExpr}": ${err.message}`);
    }
  }

  /**
   * Returns a configured S3Client instance. `overrides` permet de tester des
   * identifiants pas encore enregistrés (bouton "Tester la connexion") sans
   * devoir d'abord les sauvegarder en settings.
   */
  private getS3Client(overrides?: {
    endpoint?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  }): S3Client {
    const endpoint = overrides?.endpoint ?? this.settings.get('backupS3Endpoint');
    const region = overrides?.region || this.settings.get('backupS3Region') || 'us-east-1';
    const accessKeyId = overrides?.accessKeyId ?? this.settings.get('backupS3AccessKey');
    const secretAccessKey = overrides?.secretAccessKey ?? this.settings.get('backupS3SecretKey');

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('S3 access key or secret key is missing in settings.');
    }

    return new S3Client({
      endpoint: endpoint || undefined,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  /**
   * Teste des identifiants S3 (bouton "Tester la connexion" du panel) sans
   * déclencher de sauvegarde. Un champ vide/masqué (••••) retombe sur la
   * valeur déjà enregistrée en settings — pratique pour tester juste après
   * avoir changé le bucket sans ressaisir la clé secrète.
   */
  async testS3Connection(params: {
    endpoint?: string;
    region?: string;
    bucket: string;
    accessKey?: string;
    secretKey?: string;
  }): Promise<{ ok: boolean; message: string }> {
    const bucket = params.bucket?.trim();
    if (!bucket) {
      return { ok: false, message: 'Nom du bucket manquant.' };
    }
    const accessKeyId = params.accessKey && !/^•+$/.test(params.accessKey) ? params.accessKey : this.settings.get('backupS3AccessKey');
    const secretAccessKey = params.secretKey && !/^•+$/.test(params.secretKey) ? params.secretKey : this.settings.get('backupS3SecretKey');
    if (!accessKeyId || !secretAccessKey) {
      this.logger.warn(`Test S3 échoué (bucket ${bucket}) : clé d'accès ou clé secrète manquante.`);
      return { ok: false, message: "Clé d'accès ou clé secrète manquante." };
    }

    this.logger.log(`Test de connexion S3 en cours (bucket "${bucket}"${params.endpoint ? `, endpoint ${params.endpoint}` : ''})...`);
    try {
      const s3 = this.getS3Client({
        endpoint: params.endpoint,
        region: params.region,
        accessKeyId,
        secretAccessKey,
      });
      await s3.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
      this.logger.log(`Test S3 réussi : bucket "${bucket}" accessible.`);
      return { ok: true, message: `Connexion réussie — le bucket "${bucket}" est accessible.` };
    } catch (err: any) {
      const message = err?.message ?? String(err);
      this.logger.warn(`Test S3 échoué (bucket "${bucket}") : ${message}`);
      return { ok: false, message: `Échec de connexion : ${message}` };
    }
  }

  /**
   * Déclenche une sauvegarde manuelle en tâche de fond (bouton "Lancer une
   * sauvegarde" du panel) SANS attendre sa fin. Pour une base volumineuse
   * (des centaines de Mo), la requête + sérialisation + upload peut prendre
   * largement plus longtemps que le timeout du reverse-proxy devant l'API en
   * prod (Traefik/Coolify) — attendre la fin avant de répondre HTTP faisait
   * couper la connexion en route : le navigateur ne recevait ni succès ni
   * erreur. Le panel poll désormais getManualRunStatus() pour suivre la
   * progression réelle.
   */
  triggerManualBackup(overrideStorageType?: 'local' | 's3'): { started: boolean; message?: string } {
    if (this.manualRun.running) {
      return { started: false, message: 'Une sauvegarde manuelle est déjà en cours.' };
    }
    this.manualRun = { running: true, startedAt: Date.now() };
    this.runBackup(overrideStorageType)
      .then((filename) => {
        this.manualRun = { running: false, startedAt: this.manualRun.startedAt, finishedAt: Date.now(), success: true, filename };
      })
      .catch((err) => {
        this.manualRun = {
          running: false,
          startedAt: this.manualRun.startedAt,
          finishedAt: Date.now(),
          success: false,
          error: String(err?.message ?? err),
        };
      });
    return { started: true };
  }

  /** État de la dernière sauvegarde manuelle déclenchée — pour le polling du panel. */
  getManualRunStatus() {
    return this.manualRun;
  }

  /**
   * Run a database backup (save either locally or to S3 depending on
   * settings). `overrideStorageType` force la destination pour CET appel
   * uniquement (bouton "Lancer maintenant" du panel) — le cycle automatique
   * planifié, lui, n'appelle jamais avec un override et suit toujours le
   * réglage global `backupStorageType`.
   */
  /**
   * Sauvegarde en STREAMING plutôt qu'en un unique gros buffer JSON en RAM.
   *
   * Avant (v2.4.4 et antérieur) : tout le contenu était construit avec
   * `JSON.stringify` sur un objet chargeant CHAQUE table entière via
   * `findMany()` sans pagination, puis uploadé en un seul `PutObjectCommand`.
   * Sur une base de plusieurs Go (`ProxyUsage`/`BackendProxy` à fort volume),
   * ça dépassait la limite de taille de string V8 et/ou faisait OOM le
   * process avant même d'atteindre l'upload — et `PutObjectCommand` (upload
   * S3 non multipart) a de toute façon une limite dure de 5 Go par objet.
   *
   * Désormais : le JSON est écrit incrémentalement dans un flux, les grosses
   * tables sont lues par pages (curseur sur `id`, jamais toute la table en
   * mémoire à la fois), et l'upload S3 passe par `@aws-sdk/lib-storage`
   * (multipart automatique, sans limite de 5 Go, streaming direct).
   */
  async runBackup(overrideStorageType?: 'local' | 's3'): Promise<string> {
    const startedAt = Date.now();
    const version = '2.0.0';
    const exportedAt = new Date().toISOString();
    this.logger.log('Starting database backup export (streaming)...');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-db-${timestamp}.json`;
    const storageType = overrideStorageType ?? (this.settings.get('backupStorageType') || 'local');
    this.logger.log(
      `Backup starting — destination: ${storageType}${overrideStorageType ? ' (manual override)' : ''}.`,
    );

    const stream = new PassThrough();
    const producer = this.writeBackupContent(stream, version, exportedAt).catch((err) => {
      // Propager l'erreur au flux : sinon le consumer (fichier/S3) reste
      // bloqué à attendre des données qui ne viendront jamais.
      stream.destroy(err);
      throw err;
    });

    try {
      if (storageType === 's3') {
        const bucket = this.settings.get('backupS3Bucket');
        if (!bucket) {
          throw new Error('S3 bucket name is missing in settings.');
        }
        this.logger.log(`Uploading backup to S3 bucket ${bucket} as ${filename} (multipart)...`);
        const s3 = this.getS3Client();
        const upload = new Upload({
          client: s3,
          params: { Bucket: bucket, Key: filename, Body: stream, ContentType: 'application/json' },
          // Parts de 16 Mo : couvre confortablement une base de plusieurs Go
          // sans multiplier le nombre de parts (limite S3 = 10 000 parts/objet).
          partSize: 16 * 1024 * 1024,
          queueSize: 4,
        });
        await Promise.all([upload.done(), producer]);
        this.logger.log(`Successfully uploaded backup to S3: ${filename}`);
      } else {
        // Local persistence (Coolify-compatible volume storage)
        const localPath = this.settings.get('backupLocalPath') || './data/backups';
        const targetDir = path.resolve(localPath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        const filePath = path.join(targetDir, filename);
        this.logger.log(`Writing local database backup to ${filePath}...`);
        const fileStream = fs.createWriteStream(filePath);
        await Promise.all([pipeline(stream, fileStream), producer]);
        this.logger.log(`Successfully saved local backup: ${filePath}`);
      }
    } catch (err: any) {
      this.logger.error(
        `Backup write failed (destination: ${storageType}, ${filename}) after ${Date.now() - startedAt}ms: ${err?.message ?? err}`,
      );
      throw err;
    }

    this.logger.log(`Backup completed in ${Date.now() - startedAt}ms: ${filename} (${storageType}).`);
    return filename;
  }

  /** Écrit un chunk dans le flux, en respectant le backpressure (`drain`). */
  private writeChunk(stream: PassThrough, chunk: string): Promise<void> {
    if (stream.write(chunk)) return Promise.resolve();
    return new Promise((resolve) => stream.once('drain', () => resolve()));
  }

  /**
   * Écrit une table entière comme tableau JSON dans le flux, par pages
   * (curseur sur `id`) — jamais plus de `BACKUP_PAGE_SIZE` lignes en mémoire
   * à la fois, quelle que soit la taille réelle de la table.
   */
  private async writeTableArray(
    stream: PassThrough,
    fetchPage: (cursorId: string | null) => Promise<any[]>,
  ): Promise<void> {
    await this.writeChunk(stream, '[');
    let cursorId: string | null = null;
    let first = true;
    for (;;) {
      const rows = await fetchPage(cursorId);
      if (rows.length === 0) break;
      for (const row of rows) {
        if (!first) await this.writeChunk(stream, ',');
        first = false;
        await this.writeChunk(stream, JSON.stringify(row, (_k, v) => bigIntSafe(v)));
      }
      cursorId = rows[rows.length - 1].id;
      if (rows.length < BACKUP_PAGE_SIZE) break;
    }
    await this.writeChunk(stream, ']');
  }

  /** Écrit une table chargée entière (petites tables, taille bornée sans risque). */
  private async writeTableArrayFull(stream: PassThrough, rows: any[]): Promise<void> {
    await this.writeChunk(stream, JSON.stringify(rows, (_k, v) => bigIntSafe(v)));
  }

  /** Construit le JSON du backup et le pousse dans `stream` au fil de l'eau. */
  private async writeBackupContent(stream: PassThrough, version: string, exportedAt: string): Promise<void> {
    try {
      await this.writeChunk(
        stream,
        `{"version":${JSON.stringify(version)},"exportedAt":${JSON.stringify(exportedAt)},"data":{`,
      );

      const addons = await this.prisma.addon.findMany();

      await this.writeChunk(stream, '"appMeta":');
      await this.writeTableArrayFull(stream, await this.prisma.appMeta.findMany());

      await this.writeChunk(stream, ',"setting":');
      await this.writeTableArrayFull(stream, await this.prisma.setting.findMany());

      await this.writeChunk(stream, ',"scraperSource":');
      await this.writeTableArrayFull(stream, await this.prisma.scraperSource.findMany());

      await this.writeChunk(stream, ',"panelUser":');
      await this.writeTableArrayFull(stream, await this.prisma.panelUser.findMany());

      // Grosses tables : paginées par curseur, jamais chargées en une fois.
      await this.writeChunk(stream, ',"userProxy":');
      await this.writeTableArray(stream, (cursorId) =>
        this.prisma.userProxy.findMany({
          take: BACKUP_PAGE_SIZE,
          orderBy: { id: 'asc' },
          ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        }),
      );

      await this.writeChunk(stream, ',"passwordResetToken":');
      await this.writeTableArrayFull(stream, await this.prisma.passwordResetToken.findMany());

      await this.writeChunk(stream, ',"proxyUsage":');
      await this.writeTableArray(stream, (cursorId) =>
        this.prisma.proxyUsage.findMany({
          take: BACKUP_PAGE_SIZE,
          orderBy: { id: 'asc' },
          ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        }),
      );

      await this.writeChunk(stream, ',"backendProxy":');
      await this.writeTableArray(stream, (cursorId) =>
        this.prisma.backendProxy.findMany({
          take: BACKUP_PAGE_SIZE,
          orderBy: { id: 'asc' },
          ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        }),
      );

      await this.writeChunk(stream, ',"targetBlock":');
      await this.writeTableArrayFull(stream, await this.prisma.targetBlock.findMany());

      await this.writeChunk(stream, ',"addon":');
      await this.writeTableArrayFull(stream, addons);

      const addonData = await this.exportAddonData(addons);
      await this.writeChunk(stream, `,"addonData":${JSON.stringify(addonData)}`);

      await this.writeChunk(stream, '}}');
      stream.end();
    } catch (err) {
      stream.destroy(err as Error);
      throw err;
    }
  }

  // ─── Addon backup helpers ──────────────────────────────────────────────────

  /**
   * Appelle le endpoint d'export de chaque addon qui en déclare un.
   * Retourne un objet { [addonId]: données } inclus dans le backup.
   */
  private async exportAddonData(addons: any[]): Promise<Record<string, any>> {
    const apiKey = this.settings.get('apiKey') ?? '';
    const result: Record<string, any> = {};

    for (const addon of addons) {
      const manifest = addon.manifest as any;
      const endpoint = manifest?.backup?.exportEndpoint;
      if (!addon.enabled || !endpoint) continue;

      const header = manifest?.backup?.authHeader ?? 'X-Panel-Key';
      const url = `${addon.baseUrl.replace(/\/+$/, '')}${endpoint}`;
      try {
        const res = await fetch(url, {
          headers: { [header]: apiKey },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          result[addon.id] = await res.json();
          this.logger.log(`Addon backup exported: ${addon.baseUrl}`);
        } else {
          this.logger.warn(`Addon backup export failed (${res.status}): ${url}`);
        }
      } catch (err: any) {
        this.logger.warn(`Addon backup unreachable (${addon.baseUrl}): ${err?.message}`);
      }
    }

    return result;
  }

  /**
   * Envoie les données sauvegardées à chaque addon qui expose un endpoint d'import.
   */
  private async importAddonData(
    addons: any[],
    addonData: Record<string, any>,
  ): Promise<void> {
    const apiKey = this.settings.get('apiKey') ?? '';

    for (const addon of addons) {
      const manifest = addon.manifest as any;
      const endpoint = manifest?.backup?.importEndpoint;
      const data = addonData?.[addon.id];
      if (!endpoint || !data) continue;

      const header = manifest?.backup?.authHeader ?? 'X-Panel-Key';
      const url = `${addon.baseUrl.replace(/\/+$/, '')}${endpoint}`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { [header]: apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          this.logger.log(`Addon data restored: ${addon.baseUrl}`);
        } else {
          this.logger.warn(`Addon restore failed (${res.status}): ${url}`);
        }
      } catch (err: any) {
        this.logger.warn(`Addon restore unreachable (${addon.baseUrl}): ${err?.message}`);
      }
    }
  }

  /**
   * Restore database from a specific file.
   */
  async restoreBackup(filename: string): Promise<void> {
    let content = '';
    const storageType = this.settings.get('backupStorageType') || 'local';

    if (storageType === 's3') {
      const bucket = this.settings.get('backupS3Bucket');
      if (!bucket) {
        throw new Error('S3 bucket name is missing in settings.');
      }
      this.logger.log(`Fetching backup ${filename} from S3 bucket ${bucket}...`);
      const s3 = this.getS3Client();
      const res = await s3.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: filename,
        }),
      );
      if (!res.Body) {
        throw new Error('S3 backup file is empty or response body is undefined.');
      }
      content = await res.Body.transformToString();
    } else {
      const localPath = this.settings.get('backupLocalPath') || './data/backups';
      const filePath = path.join(path.resolve(localPath), filename);
      this.logger.log(`Reading local backup from ${filePath}...`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Local backup file not found: ${filename}`);
      }
      content = fs.readFileSync(filePath, 'utf8');
    }

    const payload = JSON.parse(content);
    if (!payload.data) {
      throw new Error('Invalid backup file structure: missing data field.');
    }

    const data = payload.data;
    const parseDate = (d: any) => (d ? new Date(d) : null);
    const parseDateRequired = (d: any) => new Date(d);

    this.logger.log('Executing database restore transaction...');

    await this.prisma.$transaction(
      async (tx) => {
        // 1. Delete all existing records in reverse relation order
        await tx.targetBlock.deleteMany();
        await tx.backendProxy.deleteMany();
        await tx.proxyUsage.deleteMany();
        await tx.passwordResetToken.deleteMany();
        await tx.userProxy.deleteMany();
        await tx.panelUser.deleteMany();
        await tx.scraperSource.deleteMany();
        await tx.setting.deleteMany();
        await tx.appMeta.deleteMany();
        await tx.addon.deleteMany();

        // 2. Insert records in positive relation order
        if (data.appMeta && data.appMeta.length > 0) {
          await tx.appMeta.createMany({
            data: data.appMeta.map((x: any) => ({
              ...x,
              updatedAt: parseDateRequired(x.updatedAt),
            })),
          });
        }

        if (data.setting && data.setting.length > 0) {
          await tx.setting.createMany({
            data: data.setting.map((x: any) => ({
              ...x,
              updatedAt: parseDateRequired(x.updatedAt),
            })),
          });
        }

        if (data.scraperSource && data.scraperSource.length > 0) {
          await tx.scraperSource.createMany({
            data: data.scraperSource.map((x: any) => ({
              ...x,
              createdAt: parseDateRequired(x.createdAt),
            })),
          });
        }

        if (data.panelUser && data.panelUser.length > 0) {
          await tx.panelUser.createMany({
            data: data.panelUser.map((x: any) => ({
              ...x,
              createdAt: parseDateRequired(x.createdAt),
            })),
          });
        }

        if (data.userProxy && data.userProxy.length > 0) {
          await tx.userProxy.createMany({
            data: data.userProxy.map((x: any) => ({
              ...x,
              totalBytesSent: x.totalBytesSent != null ? BigInt(x.totalBytesSent) : 0n,
              totalBytesReceived: x.totalBytesReceived != null ? BigInt(x.totalBytesReceived) : 0n,
              trafficLimit: x.trafficLimit != null ? BigInt(x.trafficLimit) : null,
              createdAt: parseDateRequired(x.createdAt),
            })),
          });
        }

        if (data.passwordResetToken && data.passwordResetToken.length > 0) {
          await tx.passwordResetToken.createMany({
            data: data.passwordResetToken.map((x: any) => ({
              ...x,
              expiresAt: parseDateRequired(x.expiresAt),
              usedAt: parseDate(x.usedAt),
              createdAt: parseDateRequired(x.createdAt),
            })),
          });
        }

        if (data.proxyUsage && data.proxyUsage.length > 0) {
          await tx.proxyUsage.createMany({
            data: data.proxyUsage.map((x: any) => ({
              ...x,
              date: parseDateRequired(x.date),
            })),
          });
        }

        if (data.backendProxy && data.backendProxy.length > 0) {
          await tx.backendProxy.createMany({
            data: data.backendProxy.map((x: any) => ({
              ...x,
              lastChecked: parseDateRequired(x.lastChecked),
            })),
          });
        }

        if (data.targetBlock && data.targetBlock.length > 0) {
          await tx.targetBlock.createMany({
            data: data.targetBlock.map((x: any) => ({
              ...x,
              blockedAt: parseDateRequired(x.blockedAt),
            })),
          });
        }

        // Restore addons config (manifest + metadata)
        if (data.addon && data.addon.length > 0) {
          await tx.addon.createMany({
            data: data.addon.map((x: any) => ({
              id:            x.id,
              baseUrl:       x.baseUrl,
              manifest:      x.manifest ?? null,
              manifestError: x.manifestError ?? null,
              fetchedAt:     x.fetchedAt ? new Date(x.fetchedAt) : null,
              enabled:       x.enabled ?? true,
              createdAt:     parseDateRequired(x.createdAt),
              lastVersion:   x.lastVersion ?? null,
              hasUpdate:     x.hasUpdate ?? false,
            })),
          });
        }
      },
      {
        // 30s était insuffisant pour restaurer une base volumineuse (des
        // centaines de milliers de BackendProxy/ProxyUsage) — la transaction
        // expirait avant la fin des createMany, laissant la restauration
        // partielle. Cf. runBackup/triggerManualBackup pour le même souci
        // côté sauvegarde manuelle (timeout du reverse-proxy, pas de Prisma).
        timeout: 300_000,
      },
    );

    // Reload settings cache to reflect the restored settings
    await this.settings.reload();
    this.reschedule();
    this.logger.log('Database restore transaction finished successfully.');

    // Restore addon external data (non-blocking — addons may be offline)
    if (data.addon?.length && data.addonData) {
      this.logger.log('Restoring addon external data…');
      await this.importAddonData(data.addon, data.addonData).catch((e) =>
        this.logger.warn(`Addon data restore partial: ${e?.message}`),
      );
    }
  }

  /**
   * List all available backups.
   */
  async listBackups(): Promise<any[]> {
    const storageType = this.settings.get('backupStorageType') || 'local';

    if (storageType === 's3') {
      const bucket = this.settings.get('backupS3Bucket');
      if (!bucket) {
        return [];
      }
      try {
        const s3 = this.getS3Client();
        const res = await s3.send(
          new ListObjectsV2Command({
            Bucket: bucket,
          }),
        );
        if (!res.Contents) return [];
        return res.Contents.map((obj) => ({
          filename: obj.Key || '',
          size: obj.Size,
          updatedAt: obj.LastModified,
          storage: 's3',
        })).filter((x) => x.filename && x.filename.startsWith('backup-db-') && x.filename.endsWith('.json'));
      } catch (err) {
        this.logger.error(`Failed to list S3 backups: ${err.message}`);
        return [];
      }
    } else {
      const localPath = this.settings.get('backupLocalPath') || './data/backups';
      const targetDir = path.resolve(localPath);
      if (!fs.existsSync(targetDir)) {
        return [];
      }
      const files = fs.readdirSync(targetDir);
      return files
        .filter((file) => file.startsWith('backup-db-') && file.endsWith('.json'))
        .map((file) => {
          const filePath = path.join(targetDir, file);
          const stat = fs.statSync(filePath);
          return {
            filename: file,
            size: stat.size,
            updatedAt: stat.mtime,
            storage: 'local',
          };
        });
    }
  }

  /**
   * Delete a backup.
   */
  async deleteBackup(filename: string): Promise<void> {
    const storageType = this.settings.get('backupStorageType') || 'local';

    if (storageType === 's3') {
      const bucket = this.settings.get('backupS3Bucket');
      if (!bucket) {
        throw new Error('S3 bucket name is missing.');
      }
      const s3 = this.getS3Client();
      await s3.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: filename,
        }),
      );
      this.logger.log(`Deleted S3 backup: ${filename}`);
    } else {
      const localPath = this.settings.get('backupLocalPath') || './data/backups';
      const filePath = path.join(path.resolve(localPath), filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.log(`Deleted local backup: ${filename}`);
      }
    }
  }

  /**
   * Export all system settings as a clean key-value JSON string.
   */
  async exportSettings(): Promise<string> {
    const settings = await this.prisma.setting.findMany();
    const kvMap: Record<string, string> = {};
    for (const s of settings) {
      // Do not export the API key or secret values that are highly instance-specific
      if (s.key === 'apiKey') continue;
      kvMap[s.key] = s.value;
    }
    return JSON.stringify(kvMap, null, 2);
  }

  /**
   * Import settings from a JSON structure.
   */
  async importSettings(settingsJson: string): Promise<void> {
    let imported: Record<string, string>;
    try {
      imported = JSON.parse(settingsJson);
    } catch (e) {
      throw new Error('Invalid JSON file format.');
    }

    // Filter valid keys only to avoid database pollution
    for (const [key, value] of Object.entries(imported)) {
      if (key === 'apiKey') continue; // Safeguard the API key
      await this.prisma.setting.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      });
    }

    // Refresh cache and reschedule backups
    await this.settings.reload();
    this.reschedule();
    this.logger.log('Successfully imported settings from JSON file.');
  }
}
