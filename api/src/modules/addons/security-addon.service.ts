import { ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { fetch } from 'undici';
import { SettingsService } from '../../config/settings.service';
import { PrismaService } from '../../database/prisma.service';
import { BundledAddonsService } from './bundled-addons.service';
import { t } from '../../common/utils/i18n';

export type SecurityAction = 'login' | 'register' | 'forgot';

interface PanelConfig {
  protect: Record<SecurityAction, boolean>;
  badge: boolean;
  failOpen: boolean;
  csp: { script: string[]; connect: string[] };
}

/**
 * Pont vers l'addon Sécurité (empreinte d'appareil BloumeID / ThumbmarkJS / FingerprintJS / Fingerprint.com).
 * Addon inactif = aucune vérification (comportement historique). Addon actif : le navigateur joint un `securityToken`
 * (obtenu par le SDK de l'addon) à la connexion / l'inscription / « mot de passe oublié », et le panel demande la décision
 * à l'addon (clé API du panel). Addon injoignable : politique `failOpen` de l'addon (par défaut on laisse passer).
 */
@Injectable()
export class SecurityAddonService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SecurityAddonService.name);
  private cache: { at: number; active: boolean; cfg: PanelConfig | null } = { at: 0, active: false, cfg: null };
  private timer: NodeJS.Timeout | null = null;

  /** Rafraîchit le cache en continu : la CSP (synchrone) lit les origines à autoriser dans ce cache. */
  onModuleInit() { this.timer = setInterval(() => void this.state().catch(() => undefined), 60_000); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly bundled: BundledAddonsService,
  ) {}

  private port(): number | null {
    return this.bundled.runningPort('security');
  }

  private async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
    const port = this.port();
    if (!port) throw new Error('addon arrêté');
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'X-Panel-Key': this.settings.get('apiKey') || '', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /** État (addon activé + configuration publique), mis en cache 30 s. */
  async state(): Promise<{ active: boolean; cfg: PanelConfig | null }> {
    if (Date.now() - this.cache.at < 30_000) return this.cache;
    let active = false;
    let cfg: PanelConfig | null = null;
    try {
      active = !!(await this.prisma.addon.findFirst({ where: { baseUrl: '/addon-proxy/security', enabled: true }, select: { id: true } })) && !!this.port();
      if (active) cfg = (await this.call('GET', '/api/internal/panel-config')) as PanelConfig;
    } catch (e: any) {
      this.logger.warn(`Addon Sécurité : configuration illisible (${e?.message ?? e})`);
      cfg = this.cache.cfg; // dernière configuration connue
    }
    this.cache = { at: Date.now(), active, cfg };
    return this.cache;
  }

  invalidate(): void { this.cache.at = 0; }

  /** Pour l'écran de connexion (public) : actions protégées + badge. null = addon inactif. */
  async publicStatus(): Promise<{ login: boolean; register: boolean; forgot: boolean; badge: boolean } | null> {
    const s = await this.state();
    if (!s.active || !s.cfg) return null;
    return { ...s.cfg.protect, badge: s.cfg.badge };
  }

  /** Origines à autoriser dans la CSP (serveur BloumeID, Fingerprint.com) — lecture synchrone du cache. */
  cspScript(): string[] { return this.cache.active ? this.cache.cfg?.csp.script ?? [] : []; }
  cspConnect(): string[] { return this.cache.active ? this.cache.cfg?.csp.connect ?? [] : []; }

  /**
   * Décision de l'addon. Lève 403 si l'appareil est bloqué ; renvoie l'identifiant d'événement (à rattacher au compte
   * créé lors d'une inscription). Addon inactif ou action non protégée : null.
   */
  async enforce(action: SecurityAction, ctx: { token?: string; ip: string; email?: string; userId?: string; role?: string }): Promise<string | null> {
    const s = await this.state();
    if (!s.active || !s.cfg?.protect?.[action]) return null;
    try {
      const r = await this.call('POST', '/api/internal/check', { action, token: ctx.token || undefined, ip: ctx.ip, email: ctx.email, user_id: ctx.userId, role: ctx.role });
      if (r?.decision === 'block') throw new ForbiddenException(t('errors.securityBlocked'));
      return typeof r?.event_id === 'string' ? r.event_id : null;
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      this.logger.warn(`Addon Sécurité injoignable (${(e as Error)?.message ?? e})`);
      if (s.cfg.failOpen) return null;
      throw new ServiceUnavailableException(t('errors.securityUnavailable'));
    }
  }

  /** Inscription réussie : rattache le compte à l'appareil (best effort). */
  async link(eventId: string | null, userId: string, email: string): Promise<void> {
    if (!eventId) return;
    try { await this.call('POST', '/api/internal/link', { event_id: eventId, user_id: userId, email }); } catch { /* sans gravité */ }
  }
}
