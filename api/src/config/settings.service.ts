import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { randomString } from '../common/utils/proxy-format';

/**
 * Clés de configuration éditables depuis le panel admin.
 * Chaque clé a une valeur par défaut et, optionnellement, une variable d'env
 * de repli (utilisée tant qu'aucune valeur n'est écrite en base).
 *
 * Les valeurs d'infra critiques (DATABASE_URL, PROXY_PORT, API_PORT) ne sont
 * PAS gérées ici : elles restent env-only.
 */
export const SETTING_DEFS = {
  siteName: { def: 'UHQ Panel OS by Bloume.fr', env: undefined, secret: false },
  logoUrl: { def: '/static/logo.png', env: undefined, secret: false },
  registrationEnabled: { def: 'false', env: undefined, secret: false },
  defaultLang: { def: 'fr', env: undefined, secret: false },
  // URL JSON renvoyant { "version": "x.y.z" } pour la vérification de MAJ.
  // Vide = utilisation automatique des releases GitHub officielles.
  updateCheckUrl: { def: '', env: 'UPDATE_CHECK_URL', secret: false },
  publicProxyHost: { def: 'prx.uhq.monster', env: 'PUBLIC_PROXY_HOST', secret: false },
  publicProxyPort: { def: '990', env: 'PUBLIC_PROXY_PORT', secret: false },
  proxyTimeout: { def: '3', env: 'PROXY_TIMEOUT', secret: false },
  proxyRacingTimeout: { def: '1.5', env: 'PROXY_RACING_TIMEOUT', secret: false },
  scrapeInterval: { def: '3600', env: 'SCRAPE_INTERVAL', secret: false },
  // Adaptive scaling : si le pool de proxies fonctionnels tombe sous ce seuil,
  // un rescrape anticipé est déclenché (toutes les 60s) au lieu d'attendre
  // `scrapeInterval`. Mettre une petite valeur si votre déploiement a
  // naturellement peu de proxies, sinon ça boucle en permanence.
  scraperMinPoolSize: { def: '5000', env: 'SCRAPER_MIN_POOL_SIZE', secret: false },
  proxyCheckInterval: { def: '900', env: 'PROXY_CHECK_INTERVAL', secret: false },
  geoResolveInterval: { def: '600', env: 'GEO_RESOLVE_INTERVAL', secret: false },
  checkerConcurrency: { def: '500', env: 'CHECKER_CONCURRENCY', secret: false },
  skipDeadProxies: { def: 'true', env: undefined, secret: false },
  deadProxyMaxRetries: { def: '3', env: undefined, secret: false },
  scraperProxy: { def: '', env: 'SCRAPER_PROXY', secret: true },
  groqApiKey: { def: '', env: 'GROQ_API_KEY', secret: true },
  // Clé API de l'API legacy /api/v1 — générée au setup, régénérable depuis le panel.
  apiKey: { def: '', env: 'ADMIN_PASSWORD', secret: true },
  // ── SMTP ────────────────────────────────────────────────────────────────────
  smtpHost: { def: '', env: 'SMTP_HOST', secret: false },
  smtpPort: { def: '587', env: 'SMTP_PORT', secret: false },
  smtpUser: { def: '', env: 'SMTP_USER', secret: false },
  smtpPass: { def: '', env: 'SMTP_PASS', secret: true },
  smtpFrom: { def: '', env: 'SMTP_FROM', secret: false },
  smtpSecure: { def: 'false', env: 'SMTP_SECURE', secret: false },
  // Notifications e-mail
  emailOnRegister: { def: 'false', env: undefined, secret: false },
  emailOnLogin: { def: 'false', env: undefined, secret: false },
  emailResetEnabled: { def: 'false', env: undefined, secret: false },
  // Rapports automatiques
  smtpReportsEnabled: { def: 'false', env: undefined, secret: false },
  smtpReportEmail: { def: '', env: undefined, secret: false },
  smtpReportFrequency: { def: 'daily', env: undefined, secret: false },
  // ── Captcha ─────────────────────────────────────────────────────────────────
  // Provider : none | hcaptcha | recaptcha | turnstile | cap
  captchaProvider: { def: 'none', env: undefined, secret: false },
  captchaSiteKey: { def: '', env: undefined, secret: false },
  captchaSecretKey: { def: '', env: undefined, secret: true },
  // CAP seulement : URL de base de l'instance (ex. https://cap.trycap.dev)
  captchaCapEndpoint: { def: '', env: undefined, secret: false },
  // ── Maintenance Mode ────────────────────────────────────────────────────────
  maintenanceModeEnabled: { def: 'false', env: undefined, secret: false },
  // ── Discord / Slack / BloumeChat Webhooks ──────────────────────────────────
  discordWebhookUrl: { def: '', env: undefined, secret: true },
  discordAlertsEnabled: { def: 'false', env: undefined, secret: false },
  slackWebhookUrl: { def: '', env: undefined, secret: true },
  slackAlertsEnabled: { def: 'false', env: undefined, secret: false },
  bloumechatWebhookUrl: { def: '', env: undefined, secret: true },
  bloumechatAlertsEnabled: { def: 'false', env: undefined, secret: false },
  // ── Database Backups ────────────────────────────────────────────────────────
  backupDatabaseEnabled: { def: 'false', env: undefined, secret: false },
  backupIntervalCron: { def: '0 0 * * *', env: undefined, secret: false },
  backupStorageType: { def: 'local', env: undefined, secret: false },
  backupLocalPath: { def: './data/backups', env: undefined, secret: false },
  backupS3Endpoint: { def: '', env: undefined, secret: false },
  backupS3Bucket: { def: '', env: undefined, secret: false },
  backupS3AccessKey: { def: '', env: undefined, secret: false },
  backupS3SecretKey: { def: '', env: undefined, secret: true },
  backupS3Region: { def: 'us-east-1', env: undefined, secret: false },
  // ── Invitations ─────────────────────────────────────────────────────────────
  invitationsEnabled: { def: 'false', env: undefined, secret: false },
} as const;

export type SettingKey = keyof typeof SETTING_DEFS;

/** Masque affiché à la place d'un secret en lecture API. */
export const SECRET_MASK = '••••••••';

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private cache = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  /** Recharge tout le cache depuis la base. */
  async reload(): Promise<void> {
    try {
      const rows = await this.prisma.setting.findMany();
      this.cache = new Map(rows.map((r) => [r.key, r.value]));
      this.logger.log(`Loaded ${rows.length} settings from DB.`);
    } catch (e) {
      this.logger.warn(`Could not load settings (DB not ready?): ${e}`);
    }
  }

  /**
   * Résout une valeur : cache DB → variable d'env de repli → défaut.
   * Synchrone : repose sur le cache préchargé (rafraîchi à chaque `set`).
   */
  get(key: SettingKey): string {
    if (this.cache.has(key)) return this.cache.get(key)!;
    const def = SETTING_DEFS[key];
    if (def.env && process.env[def.env] != null && process.env[def.env] !== '') {
      return process.env[def.env] as string;
    }
    return def.def;
  }

  getNumber(key: SettingKey): number {
    const n = Number(this.get(key));
    return Number.isFinite(n) ? n : Number(SETTING_DEFS[key].def);
  }

  /**
   * Comme `getNumber`, mais retombe sur le défaut si la valeur n'est pas
   * strictement positive. Indispensable pour les intervalles qui pilotent une
   * boucle `setTimeout` : `0`/vide/négatif y produirait une pause nulle et
   * donc une boucle quasi infinie au lieu de respecter l'intervalle configuré.
   */
  getPositiveNumber(key: SettingKey): number {
    const n = this.getNumber(key);
    return n > 0 ? n : Number(SETTING_DEFS[key].def);
  }

  getBool(key: SettingKey): boolean {
    return this.get(key).toLowerCase() === 'true';
  }

  /** Écrit une valeur en base et rafraîchit le cache. */
  async set(key: SettingKey, value: string): Promise<void> {
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    this.cache.set(key, value);
  }

  async setMany(values: Partial<Record<SettingKey, string>>): Promise<void> {
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined) continue;
      await this.set(k as SettingKey, v);
    }
  }

  /** Génère une nouvelle clé API (32 car.), la persiste et la renvoie. */
  async regenerateApiKey(): Promise<string> {
    const key = randomString(32);
    await this.set('apiKey', key);
    return key;
  }

  /** Garantit l'existence d'une clé API (génère au 1er besoin). Renvoie la clé. */
  async ensureApiKey(): Promise<string> {
    const existing = this.get('apiKey');
    if (existing) return existing;
    return this.regenerateApiKey();
  }

  /**
   * Toutes les clés résolues, secrets masqués (présents) ou vides.
   * `_<key>Set` indique si un secret a une valeur, sans la révéler.
   */
  getAllMasked(): Record<string, string | boolean> {
    const out: Record<string, string | boolean> = {};
    for (const key of Object.keys(SETTING_DEFS) as SettingKey[]) {
      if (key === 'updateCheckUrl') continue;
      const def = SETTING_DEFS[key];
      const raw = this.get(key);
      if (def.secret) {
        out[key] = raw ? SECRET_MASK : '';
        out[`${key}Set`] = !!raw;
      } else {
        out[key] = raw;
      }
    }
    return out;
  }
}
