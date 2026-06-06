import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { request } from 'undici';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { SettingsService } from '../../../config/settings.service';
import { PrismaService } from '../../../database/prisma.service';

const CURRENT_VERSION = process.env.npm_package_version ?? '2.0.0';

/** Informations produit + vérification de mise à jour (utilisateur connecté). */
@ApiTags('panel-about')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/panel/about')
export class AboutController {
  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async about() {
    const meta = await this.prisma.appMeta.findUnique({ where: { id: 'singleton' } }).catch(() => null);
    return {
      status: 'success',
      data: {
        name: 'UHQ Panel OS',
        company: 'Bloume SAS',
        website: 'https://bloume.fr',
        version: meta?.version ?? CURRENT_VERSION,
      },
    };
  }

  /**
   * Vérifie si une mise à jour est disponible en comparant la version courante
   * à celle renvoyée par `updateCheckUrl` ou, si vide, aux releases GitHub du dépôt
   * officiel `BloumeSAS/UHQ-Panel-OS`.
   * En conteneur, la MAJ se fait en changeant le tag d'image (Coolify/Docker).
   */
  @Get('check-update')
  async checkUpdate() {
    const customUrl = this.settings.get('updateCheckUrl');
    const current = CURRENT_VERSION;
    const url = customUrl || 'https://api.github.com/repos/BloumeSAS/UHQ-Panel-OS/releases/latest';
    try {
      const res = await request(url, {
        method: 'GET',
        headersTimeout: 8000,
        bodyTimeout: 8000,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'UHQ-Panel-OS',
        },
      });
      const body = (await res.body.json()) as { version?: string; tag_name?: string; name?: string; url?: string; html_url?: string };
      const latest = body?.version ?? body?.tag_name ?? body?.name ?? null;
      const link = body?.html_url ?? (customUrl ? body?.url ?? null : 'https://github.com/BloumeSAS/UHQ-Panel-OS/releases/latest');
      return {
        status: 'success',
        configured: true,
        current,
        latest,
        updateAvailable: latest ? isNewer(latest, current) : false,
        url: link,
        source: customUrl ? 'custom' : 'github',
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
