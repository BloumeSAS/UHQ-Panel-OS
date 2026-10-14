import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { connect } from 'net';
import { statfsSync } from 'fs';
import { request } from 'undici';
import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from '../../config/settings.service';
import { BackupService } from '../backup/backup.service';
import { NotificationService } from '../notifications/notification.service';
import { dataDir } from '../../database/db-config';

interface CheckResult {
  id: string;
  ok: boolean;
  severity: 'critical' | 'warning';
  /** Données pour le texte (les messages sont composés plus bas, en français ou en anglais). */
  data?: Record<string, string | number>;
}

interface State {
  bad: number;
  alerted: boolean;
  lastAlert: number;
}

const TICK_MS = 60_000;
const REALERT_MS = 6 * 3600_000;
const BACKUP_CHECK_MS = 30 * 60_000;

const TEXTS: Record<string, Record<string, { title: string; down: string; up: string }>> = {
  fr: {
    engine: { title: 'Moteur proxy arrêté', down: 'Le moteur proxy ne répond plus sur le port {port} : vos clients ne peuvent plus se connecter.', up: 'Le moteur proxy répond de nouveau.' },
    db: { title: 'Base de données injoignable', down: 'La base de données ne répond plus : le panel et le moteur sont dégradés.', up: 'La base de données répond de nouveau.' },
    disk: { title: 'Espace disque faible', down: 'Il ne reste que {freeGb} Go libres sur le disque : sauvegardes et journaux risquent d’échouer.', up: 'L’espace disque est redevenu suffisant ({freeGb} Go libres).' },
    backup: { title: 'Sauvegarde trop ancienne', down: 'Les sauvegardes sont activées mais la dernière date de {ageH} h. Vérifiez le stockage et lancez-en une à la main.', up: 'Les sauvegardes sont de nouveau à jour.' },
  },
  en: {
    engine: { title: 'Proxy engine down', down: 'The proxy engine no longer answers on port {port}: your customers cannot connect.', up: 'The proxy engine is answering again.' },
    db: { title: 'Database unreachable', down: 'The database no longer answers: the panel and the engine are degraded.', up: 'The database is answering again.' },
    disk: { title: 'Low disk space', down: 'Only {freeGb} GB left on disk: backups and logs may fail.', up: 'Disk space is back to a safe level ({freeGb} GB free).' },
    backup: { title: 'Backup too old', down: 'Backups are enabled but the latest one is {ageH} h old. Check the storage and run one by hand.', up: 'Backups are up to date again.' },
  },
};

function probe(port: number, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = connect({ host: '127.0.0.1', port });
    const done = (ok: boolean) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(ms, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

/**
 * Surveillance interne : toutes les minutes, vérifie le moteur proxy, la base, le disque et la fraîcheur des
 * sauvegardes. Alerte (cloche + Discord/Slack/BloumeChat + e-mail des admins) après 2 échecs consécutifs, rappelle
 * toutes les 6 h tant que ça dure, et prévient quand c'est rétabli. Un « heartbeat » optionnel (URL à appeler
 * chaque minute tant que tout va bien, type Healthchecks.io / UptimeRobot) couvre le cas où le panel entier est
 * tombé : c'est alors le service externe qui vous prévient.
 */
@Injectable()
export class HealthWatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HealthWatchService.name);
  private readonly enginePort = Number(process.env.PROXY_PORT ?? 990);
  private timer: NodeJS.Timeout | null = null;
  private starter: NodeJS.Timeout | null = null;
  private readonly states = new Map<string, State>();
  private backupCache: { at: number; result: CheckResult } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly backup: BackupService,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit() {
    // Laisse le moteur et la base finir de démarrer avant de juger.
    this.starter = setTimeout(() => {
      this.timer = setInterval(() => void this.tick(), TICK_MS);
      this.timer.unref?.();
      void this.tick();
    }, 90_000);
    this.starter.unref?.();
  }

  onModuleDestroy() {
    if (this.starter) clearTimeout(this.starter);
    if (this.timer) clearInterval(this.timer);
  }

  private lang(): 'fr' | 'en' {
    return this.settings.get('defaultLang') === 'en' ? 'en' : 'fr';
  }

  private fill(text: string, data?: Record<string, string | number>) {
    return text.replace(/\{(\w+)\}/g, (_, k) => String(data?.[k] ?? '?'));
  }

  private async checkDb(): Promise<CheckResult> {
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
      ]);
      return { id: 'db', ok: true, severity: 'critical' };
    } catch {
      return { id: 'db', ok: false, severity: 'critical' };
    }
  }

  private checkDisk(): CheckResult {
    try {
      const fs = statfsSync(dataDir());
      const freeGb = Math.round(((Number(fs.bavail) * Number(fs.bsize)) / 1e9) * 10) / 10;
      return { id: 'disk', ok: freeGb >= 2, severity: freeGb < 0.5 ? 'critical' : 'warning', data: { freeGb } };
    } catch {
      return { id: 'disk', ok: true, severity: 'warning' };
    }
  }

  private async checkBackup(): Promise<CheckResult> {
    const ok: CheckResult = { id: 'backup', ok: true, severity: 'warning' };
    if (!this.settings.getBool('backupDatabaseEnabled')) return ok;
    if (this.backupCache && Date.now() - this.backupCache.at < BACKUP_CHECK_MS) return this.backupCache.result;
    let result = ok;
    try {
      const list = await this.backup.listBackups();
      let newest = 0;
      for (const b of list) {
        const ts = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
        if (ts > newest) newest = ts;
      }
      const ageH = newest ? Math.round((Date.now() - newest) / 3_600_000) : null;
      // Pas de sauvegarde du tout : on ne juge qu'après 26 h de fonctionnement (laisse sa chance au premier cron).
      const tooOld = ageH !== null ? ageH > 48 : process.uptime() > 26 * 3600;
      if (tooOld) result = { id: 'backup', ok: false, severity: 'warning', data: { ageH: ageH ?? '∞' } };
    } catch {
      /* stockage injoignable : la sauvegarde elle-même alertera si elle échoue */
    }
    this.backupCache = { at: Date.now(), result };
    return result;
  }

  async tick() {
    if (!this.settings.getBool('healthAlertsEnabled')) return;
    try {
      const engineOk = await probe(this.enginePort, 2000);
      const db = await this.checkDb();
      const results: CheckResult[] = [
        { id: 'engine', ok: engineOk, severity: 'critical', data: { port: this.enginePort } },
        db,
        this.checkDisk(),
        await this.checkBackup(),
      ];
      for (const r of results) await this.apply(r);

      // Heartbeat : seulement si tout l'essentiel va bien (sinon l'absence de signal déclenche l'alerte externe).
      const hb = this.settings.get('heartbeatUrl').trim();
      if (hb && engineOk && db.ok) {
        try {
          await request(hb, { method: 'GET', headersTimeout: 8000, bodyTimeout: 8000, headers: { 'User-Agent': 'UHQ-Panel-OS' } }).then((r) => r.body.dump());
        } catch (e) {
          this.logger.warn(`Heartbeat injoignable : ${String((e as Error)?.message ?? e).slice(0, 120)}`);
        }
      }
    } catch (e) {
      this.logger.error(`Surveillance : ${e}`);
    }
  }

  private async apply(r: CheckResult) {
    const st = this.states.get(r.id) ?? { bad: 0, alerted: false, lastAlert: 0 };
    this.states.set(r.id, st);
    const txt = TEXTS[this.lang()][r.id];
    if (!txt) return;

    if (r.ok) {
      st.bad = 0;
      if (st.alerted) {
        st.alerted = false;
        await this.notifications.notifySystemAlert({
          id: r.id,
          severity: 'recovered',
          title: this.lang() === 'en' ? `✅ Restored — ${txt.title}` : `✅ Rétabli — ${txt.title}`,
          message: this.fill(txt.up, r.data),
          link: '/diagnostics',
        });
      }
      return;
    }
    st.bad++;
    // 2 minutes de suite (évite les fausses alertes sur un blip) ; rappel toutes les 6 h.
    if (st.bad >= 2 && (!st.alerted || Date.now() - st.lastAlert > REALERT_MS)) {
      st.alerted = true;
      st.lastAlert = Date.now();
      await this.notifications.notifySystemAlert({
        id: r.id,
        severity: r.severity,
        title: `${r.severity === 'critical' ? '🚨' : '⚠️'} ${txt.title}`,
        message: this.fill(txt.down, r.data),
        link: '/diagnostics',
      });
    }
  }
}
