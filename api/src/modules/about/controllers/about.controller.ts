import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { request } from 'undici';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { SettingsService } from '../../../config/settings.service';
import { APP_VERSION } from '../../../version';

const CURRENT_VERSION = APP_VERSION;

/** Informations produit + vérification de mise à jour (utilisateur connecté). */
@ApiTags('panel-about')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/panel/about')
export class AboutController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  about() {
    return {
      status: 'success',
      data: {
        name: 'UHQ Panel OS',
        company: 'Bloume SAS',
        website: 'https://bloume.fr',
        version: CURRENT_VERSION,
      },
    };
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
    return this.checkGhcr(current);
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

      // 2. Lister les tags de l'image
      const tagsRes = await request(`${GHCR}/v2/${IMAGE}/tags/list`, {
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
