import { BadRequestException, Body, Controller, Get, HttpException, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { request } from 'undici';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import type { JwtUser } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuditService } from '../../audit/audit.service';
import { BackupService } from '../../backup/backup.service';
import { SettingsService } from '../../../config/settings.service';
import { APP_VERSION } from '../../../version';

const CURRENT_VERSION = APP_VERSION;
const GITHUB_REPO = 'BloumeSAS/UHQ-Panel-OS';
const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;

/** Informations produit + vérification de mise à jour (utilisateur connecté). */
@ApiTags('panel-about')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/panel/about')
export class AboutController {
  constructor(
    private readonly settings: SettingsService,
    private readonly backup: BackupService,
    private readonly audit: AuditService,
  ) {}

  private lastUpdateAt = 0;
  private readonly logger = new Logger('PanelUpdate');

  /** Cache mémoire des releases GitHub (5 min) — évite de cogner la limite anonyme (60 req/h/IP). */
  private releasesCache: { at: number; data: any[] } | null = null;

  @Get()
  about() {
    return {
      status: 'success',
      data: {
        name: 'UHQ Panel OS',
        company: 'Bloume SAS',
        website: 'https://bloume.fr',
        githubUrl: GITHUB_URL,
        version: CURRENT_VERSION,
        autoUpdateConfigured: !!this.settings.get('updateWebhookUrl').trim(),
      },
    };
  }

  /**
   * Mise à jour automatique : appelle le webhook de déploiement configuré (Coolify « Deploy Webhook »,
   * Portainer, Watchtower…). Le conteneur ne peut pas se reconstruire lui-même : c'est la plateforme
   * qui reconstruit et redémarre ; le panel affiche la progression et se reconnecte (cf. UpdateOverlay).
   * Sauvegarde préalable optionnelle. Réservé ADMIN, une fois par minute.
   */
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('update')
  async update(@Body() body: { backupFirst?: boolean }, @CurrentUser() me: JwtUser) {
    const raw = this.settings.get('updateWebhookUrl').trim();
    if (!raw) throw new BadRequestException('NOT_CONFIGURED');
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException('BAD_URL');
    }
    // http(s) uniquement. Les adresses privées restent AUTORISÉES (Coolify est en général sur le même
    // serveur / réseau privé) ; seules les adresses lien-local (métadonnées cloud) sont refusées, y compris
    // derrière un nom DNS. Redirections non suivies (comportement par défaut d'undici.request).
    if (!/^https?:$/.test(url.protocol)) throw new BadRequestException('BAD_URL');
    const linkLocal = (ip: string) => /^169\.254\./.test(ip) || /^fe[89ab]/i.test(ip) || /^fd00:ec2:/i.test(ip);
    const bareHost = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(bareHost) && linkLocal(bareHost)) throw new BadRequestException('BAD_URL');
    try {
      const addrs = await lookup(bareHost, { all: true });
      if (addrs.some((a) => linkLocal(a.address))) throw new BadRequestException('BAD_URL');
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      // résolution impossible : la requête échouera plus bas avec WEBHOOK_UNREACHABLE
    }
    if (Date.now() - this.lastUpdateAt < 60_000 || this.job.phase === 'backup' || this.job.phase === 'triggering') {
      throw new HttpException('TOO_SOON', 429);
    }
    this.lastUpdateAt = Date.now();
    const withBackup = !!body?.backupFirst && this.settings.getBool('backupDatabaseEnabled');

    // La sauvegarde peut durer plusieurs minutes (grosse base) : derrière Cloudflare (100 s max) une requête
    // qui l'attendrait serait coupée (erreur 520/524). On répond tout de suite ; le travail continue en tâche
    // de fond et le panel suit l'avancement via GET /about/update-status.
    this.job = { phase: withBackup ? 'backup' : 'triggering', from: CURRENT_VERSION, startedAt: Date.now(), backup: withBackup };
    void this.runUpdateJob(url, withBackup, me);
    return { status: 'success', fromVersion: CURRENT_VERSION, backup: withBackup };
  }

  /** Avancement du déclenchement de la mise à jour (sauvegarde → appel du webhook). */
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get('update-status')
  updateStatus() {
    return { status: 'success', job: this.job };
  }

  private job: {
    phase: 'idle' | 'backup' | 'triggering' | 'done' | 'error';
    from?: string;
    startedAt?: number;
    backup?: boolean;
    error?: { code: string; status?: number; detail?: string };
  } = { phase: 'idle' };

  private fail(code: string, extra: { status?: number; detail?: string } = {}) {
    this.lastUpdateAt = 0;
    this.job = { ...this.job, phase: 'error', error: { code, ...extra } };
  }

  private async runUpdateJob(url: URL, withBackup: boolean, me: JwtUser) {
    if (withBackup) {
      try {
        await Promise.race([
          this.backup.runBackup(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 600_000)),
        ]);
      } catch (e) {
        this.logger.warn(`Sauvegarde avant mise à jour échouée : ${String((e as Error)?.message ?? e).slice(0, 200)}`);
        return this.fail('BACKUP_FAILED', { detail: String((e as Error)?.message ?? e).slice(0, 200) });
      }
      this.job = { ...this.job, phase: 'triggering' };
    }

    const token = this.settings.get('updateWebhookToken').trim();
    // Un jeton avec espace, saut de ligne ou caractère non ASCII (ex. le masque « •••• » enregistré tel quel) fait échouer undici (UND_ERR_INVALID_ARG).
    if (token && !/^[!-~]+$/.test(token)) return this.fail('TOKEN_INVALID');
    const m = this.settings.get('updateWebhookMethod').toUpperCase();
    const method = (['GET', 'POST', 'PUT', 'PATCH'].includes(m) ? m : 'GET') as 'GET' | 'POST' | 'PUT' | 'PATCH';
    // En-tête d'authentification configurable (Authorization: Bearer par défaut ; X-API-Key, jeton brut…).
    const authName = this.settings.get('updateWebhookAuthHeader').trim() || 'Authorization';
    if (!/^[A-Za-z0-9-]{1,40}$/.test(authName)) return this.fail('TOKEN_INVALID');
    const scheme = this.settings.get('updateWebhookAuthScheme').trim();
    const headers: Record<string, string> = { 'User-Agent': 'UHQ-Panel-OS' };
    // En-têtes additionnels (JSON {"Accept":"..."}) : noms/valeurs bornés, jamais Host ni Content-Length.
    const extra = this.settings.get('updateWebhookHeaders').trim();
    if (extra) {
      try {
        const obj = JSON.parse(extra) as Record<string, unknown>;
        for (const [k, v] of Object.entries(obj).slice(0, 10)) {
          if (/^[A-Za-z0-9-]{1,40}$/.test(k) && !/^(host|content-length|transfer-encoding|connection)$/i.test(k) && typeof v === 'string' && /^[ -~]{0,300}$/.test(v)) headers[k] = v;
        }
      } catch {
        return this.fail('HEADERS_INVALID');
      }
    }
    if (token) headers[authName] = scheme ? `${scheme} ${token}` : token;
    const bodyText = method === 'GET' ? '' : this.settings.get('updateWebhookBody').trim();
    if (bodyText) {
      try {
        JSON.parse(bodyText);
      } catch {
        return this.fail('BODY_INVALID');
      }
      if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
    }
    try {
      const res = await request(url.toString(), {
        method,
        headersTimeout: 15_000,
        bodyTimeout: 15_000,
        headers,
        ...(bodyText ? { body: bodyText } : {}),
      });
      // Le corps de la réponse n'est JAMAIS renvoyé au navigateur (évite de lire le contenu d'un service interne).
      const text = (await res.body.text().catch(() => '')).slice(0, 200);
      if (res.statusCode < 200 || res.statusCode >= 300) {
        this.logger.warn(`Webhook de mise à jour refusé : HTTP ${res.statusCode} ${text.replace(/\s+/g, ' ')}`);
        return this.fail('WEBHOOK_FAILED', { status: res.statusCode });
      }
    } catch (e) {
      this.logger.warn(`Webhook de mise à jour injoignable : ${String((e as Error)?.message ?? e).slice(0, 200)}`);
      const code = String((e as NodeJS.ErrnoException)?.code ?? '').slice(0, 40);
      if (code === 'UND_ERR_INVALID_ARG') return this.fail('WEBHOOK_URL_INVALID');
      return this.fail('WEBHOOK_UNREACHABLE', { detail: code });
    }

    this.job = { ...this.job, phase: 'done' };
    void this.audit
      .log({ userId: me.id, userEmail: me.email, action: 'panel.update', details: { from: CURRENT_VERSION, backup: withBackup ? 'done' : 'skipped', host: url.host } })
      .catch(() => undefined);
  }

  /**
   * Historique des versions (GitHub Releases, dépôt public — pas d'auth
   * nécessaire côté GitHub). Renvoie tout d'un coup (le panel pagine côté
   * client) : un repo actif a quelques dizaines de releases, largement sous
   * la limite d'une seule page GitHub (100).
   */
  @Get('releases')
  async releases() {
    if (this.releasesCache && Date.now() - this.releasesCache.at < 5 * 60_000) {
      return { status: 'success', data: this.releasesCache.data };
    }
    try {
      const res = await request(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=100`, {
        method: 'GET',
        headersTimeout: 8000,
        bodyTimeout: 8000,
        headers: { 'User-Agent': 'UHQ-Panel-OS', Accept: 'application/vnd.github+json' },
      });
      const body = (await res.body.json()) as any[];
      const data = (Array.isArray(body) ? body : []).map((r) => ({
        tag: r.tag_name,
        name: r.name || r.tag_name,
        body: r.body || '',
        url: r.html_url,
        publishedAt: r.published_at,
        prerelease: !!r.prerelease,
      }));
      this.releasesCache = { at: Date.now(), data };
      return { status: 'success', data };
    } catch (e) {
      return { status: 'error', message: String((e as Error)?.message ?? e), data: [] };
    }
  }

  /**
   * Vérifie si une mise à jour est disponible en comparant la version courante
   * à celle renvoyée par `updateCheckUrl` ou, si vide, au registre GHCR
   * `ghcr.io/bloumesas/uhq-panel-os` (source de vérité pour les images Docker).
   * En conteneur, la MAJ se fait en changeant le tag d'image (Coolify/Docker).
   */
  @Get('check-update')
  async checkUpdate() {
    const customUrl = this.settings.get('updateCheckUrl');
    const current = CURRENT_VERSION;
    if (customUrl) {
      return this.checkCustomUrl(customUrl, current);
    }
    const gh = await this.checkGithub(current);
    return gh ?? this.checkGhcr(current);
  }

  /** Dernière release publiée sur GitHub (source de vérité des versions) ; null si injoignable. */
  private async checkGithub(current: string) {
    try {
      const res = await request(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        method: 'GET',
        headersTimeout: 8000,
        bodyTimeout: 8000,
        headers: { 'User-Agent': 'UHQ-Panel-OS', Accept: 'application/vnd.github+json' },
      });
      if (res.statusCode !== 200) return null;
      const body = (await res.body.json()) as { tag_name?: string; html_url?: string };
      const latest = body?.tag_name ? String(body.tag_name).replace(/^v/, '') : null;
      if (!latest) return null;
      return {
        status: 'success',
        configured: true,
        current,
        latest,
        updateAvailable: isNewer(latest, current),
        url: body.html_url ?? `${GITHUB_URL}/releases`,
        source: 'github',
        autoUpdateConfigured: !!this.settings.get('updateWebhookUrl').trim(),
      };
    } catch {
      return null;
    }
  }

  private async checkCustomUrl(url: string, current: string) {
    try {
      const res = await request(url, {
        method: 'GET',
        headersTimeout: 8000,
        bodyTimeout: 8000,
        headers: { 'User-Agent': 'UHQ-Panel-OS' },
      });
      const body = (await res.body.json()) as { version?: string; tag_name?: string; name?: string; url?: string; html_url?: string };
      const latest = body?.version ?? body?.tag_name ?? body?.name ?? null;
      const link = body?.html_url ?? body?.url ?? null;
      return {
        status: 'success',
        configured: true,
        current,
        latest,
        updateAvailable: latest ? isNewer(latest, current) : false,
        url: link,
        source: 'custom',
      };
    } catch (e) {
      return { status: 'error', configured: true, current, message: String((e as Error)?.message ?? e) };
    }
  }

  private async checkGhcr(current: string) {
    const IMAGE = 'bloumesas/uhq-panel-os';
    const GHCR = 'https://ghcr.io';
    const PACKAGE_URL = 'https://github.com/BloumeSAS/UHQ-Panel-OS/pkgs/container/uhq-panel-os';
    try {
      // 1. Obtenir un token anonyme pour l'accès en lecture publique
      const tokenRes = await request(`${GHCR}/token?scope=repository:${IMAGE}:pull`, {
        method: 'GET',
        headersTimeout: 8000,
        bodyTimeout: 8000,
        headers: { 'User-Agent': 'UHQ-Panel-OS' },
      });
      const tokenBody = (await tokenRes.body.json()) as { token?: string };
      const token = tokenBody?.token;
      if (!token) throw new Error('GHCR token unavailable');

      // 2. Lister les tags de l'image — GHCR pagine sans `n` explicite (~100
      // entrées par défaut, PAS forcément triées par version) : sans ce
      // paramètre, un repo avec beaucoup de tags anciens/sha-* peut couper la
      // page juste avant les tags semver les plus récents, et check-update
      // rapporte alors une "latest" périmée. `n=1000` couvre largement la
      // volumétrie réelle de ce repo (~100 tags).
      const tagsRes = await request(`${GHCR}/v2/${IMAGE}/tags/list?n=1000`, {
        method: 'GET',
        headersTimeout: 8000,
        bodyTimeout: 8000,
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'UHQ-Panel-OS',
        },
      });
      const tagsBody = (await tagsRes.body.json()) as { tags?: string[] };
      const tags: string[] = tagsBody?.tags ?? [];

      // 3. Garder uniquement les tags semver (ex: 2.0.4) et trouver le plus récent
      const semverTags = tags.filter((t) => /^\d+\.\d+(\.\d+)?$/.test(t));
      const latest = semverTags.sort((a, b) => (isNewer(a, b) ? -1 : isNewer(b, a) ? 1 : 0))[0] ?? null;

      return {
        status: 'success',
        configured: true,
        current,
        latest,
        updateAvailable: latest ? isNewer(latest, current) : false,
        url: PACKAGE_URL,
        source: 'ghcr',
      };
    } catch (e) {
      return { status: 'error', configured: true, current, message: String((e as Error)?.message ?? e) };
    }
  }
}

/** Compare deux versions semver simples ; true si `a` > `b`. */
function isNewer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}
