import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from '../../config/settings.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import * as fs from 'fs';
import * as path from 'path';
import { fetch } from 'undici';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  private readonly jobName = 'database-backup-cron';

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

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
    try {
      const job = new CronJob(cronExpr, async () => {
        this.logger.log('Triggering scheduled database backup...');
        try {
          await this.runBackup();
        } catch (err) {
          this.logger.error(`Scheduled backup failed: ${err.message}`);
        }
      });

      this.schedulerRegistry.addCronJob(this.jobName, job);
      job.start();
      this.logger.log(`Scheduled database backup registered with cron: ${cronExpr}`);
    } catch (err) {
      this.logger.error(`Failed to register backup cron expression "${cronExpr}": ${err.message}`);
    }
  }

  /**
   * Returns a configured S3Client instance.
   */
  private getS3Client(): S3Client {
    const endpoint = this.settings.get('backupS3Endpoint');
    const region = this.settings.get('backupS3Region') || 'us-east-1';
    const accessKeyId = this.settings.get('backupS3AccessKey');
    const secretAccessKey = this.settings.get('backupS3SecretKey');

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
   * Run a database backup (save either locally or to S3 depending on settings).
   */
  async runBackup(): Promise<string> {
    const version = '2.0.0';
    const exportedAt = new Date().toISOString();

    // Query all tables in the exact order for relational integrity
    const addons = await this.prisma.addon.findMany();
    const data: Record<string, any> = {
      appMeta:            await this.prisma.appMeta.findMany(),
      setting:            await this.prisma.setting.findMany(),
      scraperSource:      await this.prisma.scraperSource.findMany(),
      panelUser:          await this.prisma.panelUser.findMany(),
      userProxy:          await this.prisma.userProxy.findMany(),
      passwordResetToken: await this.prisma.passwordResetToken.findMany(),
      proxyUsage:         await this.prisma.proxyUsage.findMany(),
      backendProxy:       await this.prisma.backendProxy.findMany(),
      targetBlock:        await this.prisma.targetBlock.findMany(),
      // ─── Addons : configs + données externes ──────────────────────────────
      addon:              addons,
      addonData:          await this.exportAddonData(addons),
    };

    const payload = {
      version,
      exportedAt,
      data,
    };

    // Serialize BigInts safely
    const content = JSON.stringify(
      payload,
      (key, value) => (typeof value === 'bigint' ? value.toString() : value),
      2,
    );

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-db-${timestamp}.json`;

    const storageType = this.settings.get('backupStorageType') || 'local';

    if (storageType === 's3') {
      const bucket = this.settings.get('backupS3Bucket');
      if (!bucket) {
        throw new Error('S3 bucket name is missing in settings.');
      }
      this.logger.log(`Uploading backup to S3 bucket ${bucket} as ${filename}...`);
      const s3 = this.getS3Client();
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: filename,
          Body: content,
          ContentType: 'application/json',
        }),
      );
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
      fs.writeFileSync(filePath, content, 'utf8');
      this.logger.log(`Successfully saved local backup: ${filePath}`);
    }

    return filename;
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
        timeout: 30000,
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
