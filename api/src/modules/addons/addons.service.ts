import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { fetch } from 'undici';
import { PrismaService } from '../../database/prisma.service';
import { AddAddonDto, UpdateAddonDto } from './dto/addon.dto';
import { AddonManifest } from './addon-manifest.types';

const MANIFEST_PATH = '/uhq-manifest.json';
const FETCH_TIMEOUT_MS = 6_000;

/**
 * Intervalle du cron de rafraîchissement automatique des manifests.
 * Configurable via ADDON_REFRESH_CRON (expression cron standard).
 * Défaut : toutes les heures.
 */
const REFRESH_CRON = process.env.ADDON_REFRESH_CRON ?? '0 * * * *';

@Injectable()
export class AddonsService {
  private readonly logger = new Logger(AddonsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Manifest ─────────────────────────────────────────────────────────────

  /**
   * Télécharge et valide le manifest depuis <baseUrl>/uhq-manifest.json.
   */
  async fetchManifest(baseUrl: string): Promise<AddonManifest> {
    const url = `${baseUrl.replace(/\/+$/, '')}${MANIFEST_PATH}`;
    let raw: unknown;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      raw = await res.json();
    } catch (err: any) {
      throw new BadRequestException(
        `Impossible de joindre l'addon : ${err?.message ?? err}`,
      );
    }

    const manifest = raw as AddonManifest;
    if (!manifest?.name || !Array.isArray(manifest?.pages)) {
      throw new BadRequestException(
        'Manifest invalide : les champs "name" et "pages" sont requis.',
      );
    }
    if (manifest.pages.length === 0) {
      throw new BadRequestException('Manifest invalide : "pages" est vide.');
    }

    return manifest;
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async findAll() {
    return this.prisma.addon.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async findAllEnabled(isAdmin: boolean) {
    const addons = await this.prisma.addon.findMany({
      where: { enabled: true },
      orderBy: { createdAt: 'asc' },
    });
    if (isAdmin) return addons;
    return addons.map((a) => {
      if (!a.manifest) return a;
      const m = a.manifest as any as AddonManifest;
      return {
        ...a,
        manifest: {
          ...m,
          pages:   m.pages.filter((p) => !p.adminOnly),
          slots:   (m.slots ?? []).filter((s) => !s.adminOnly),
          widgets: m.widgets ?? [],
        },
      };
    });
  }

  async addAddon(dto: AddAddonDto) {
    const baseUrl = dto.baseUrl.replace(/\/+$/, '');

    const existing = await this.prisma.addon.findUnique({ where: { baseUrl } });
    if (existing) throw new BadRequestException('Cet addon est déjà connecté.');

    let manifest: AddonManifest | null = null;
    let manifestError: string | null = null;
    try {
      manifest = await this.fetchManifest(baseUrl);
    } catch (err: any) {
      manifestError = err?.message ?? 'Erreur inconnue';
    }

    return this.prisma.addon.create({
      data: {
        baseUrl,
        manifest:      manifest as any,
        manifestError,
        fetchedAt:     new Date(),
        enabled:       true,
        // On mémorise la version initiale comme "connue"
        lastVersion:   manifest?.version ?? null,
        hasUpdate:     false,
      },
    });
  }

  /**
   * Rafraîchit le manifest d'un addon.
   * Si la version change → hasUpdate = true.
   */
  async refreshManifest(id: string) {
    const addon = await this.prisma.addon.findUnique({ where: { id } });
    if (!addon) throw new NotFoundException('Addon introuvable');

    let manifest: AddonManifest | null = null;
    let manifestError: string | null = null;
    try {
      manifest = await this.fetchManifest(addon.baseUrl);
      this.logger.log(`Manifest refreshed: ${addon.baseUrl} → v${manifest.version ?? '?'}`);
    } catch (err: any) {
      manifestError = err?.message ?? 'Erreur inconnue';
      this.logger.warn(`Manifest refresh failed for ${addon.baseUrl}: ${manifestError}`);
    }

    // Détection de mise à jour
    const newVersion     = manifest?.version ?? null;
    const knownVersion   = addon.lastVersion;
    const hasUpdate =
      !!newVersion &&
      !!knownVersion &&
      newVersion !== knownVersion;

    if (hasUpdate) {
      this.logger.log(
        `Mise à jour détectée pour ${addon.baseUrl} : ${knownVersion} → ${newVersion}`,
      );
    }

    return this.prisma.addon.update({
      where: { id },
      data: {
        manifest: manifest as any,
        manifestError,
        fetchedAt: new Date(),
        hasUpdate,
        // lastVersion N'est PAS mis à jour ici — seulement lors de applyUpdate()
      },
    });
  }

  /**
   * Confirme l'application de la mise à jour :
   * - Met lastVersion à jour avec la version du manifest courant
   * - Réinitialise hasUpdate à false
   */
  async applyUpdate(id: string) {
    const addon = await this.prisma.addon.findUnique({ where: { id } });
    if (!addon) throw new NotFoundException('Addon introuvable');

    const manifest = addon.manifest as any as AddonManifest | null;
    const newVersion = manifest?.version ?? null;

    return this.prisma.addon.update({
      where: { id },
      data: {
        lastVersion: newVersion,
        hasUpdate:   false,
      },
    });
  }

  async update(id: string, dto: UpdateAddonDto) {
    const addon = await this.prisma.addon.findUnique({ where: { id } });
    if (!addon) throw new NotFoundException('Addon introuvable');
    return this.prisma.addon.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const addon = await this.prisma.addon.findUnique({ where: { id } });
    if (!addon) throw new NotFoundException('Addon introuvable');
    await this.prisma.addon.delete({ where: { id } });
  }

  async previewManifest(baseUrl: string): Promise<AddonManifest> {
    return this.fetchManifest(baseUrl.replace(/\/+$/, ''));
  }

  // ─── Cron auto-refresh ────────────────────────────────────────────────────

  /**
   * Rafraîchit automatiquement tous les addons activés.
   * Intervalle : ADDON_REFRESH_CRON (défaut : toutes les heures).
   * Un délai de 2 s entre chaque addon pour ne pas surcharger les serveurs distants.
   */
  @Cron(REFRESH_CRON)
  async autoRefreshAll() {
    const addons = await this.prisma.addon.findMany({ where: { enabled: true } });
    if (!addons.length) return;

    this.logger.log(`[Cron] Auto-refresh de ${addons.length} addon(s)…`);

    for (const addon of addons) {
      try {
        await this.refreshManifest(addon.id);
      } catch (err: any) {
        this.logger.warn(`[Cron] Échec refresh ${addon.baseUrl} : ${err?.message}`);
      }
      // Délai anti-spam entre deux addons
      await new Promise((r) => setTimeout(r, 2_000));
    }

    this.logger.log('[Cron] Auto-refresh terminé.');
  }
}
