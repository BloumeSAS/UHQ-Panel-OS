import { BadRequestException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ChildProcess, spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fetch } from 'undici';
import { SettingsService } from '../../config/settings.service';
import { PrismaService } from '../../database/prisma.service';
import { AddonsService } from './addons.service';
import { bundledAddonDir, isBundleAvailable, loadOfficialAddons, OfficialAddonEntry } from './official-addons-registry';

const READY_TIMEOUT_MS = 30_000;
const READY_POLL_MS = 500;

export interface BundledAddonStatus {
  slug: string;
  available: boolean; // build présent dans CETTE image
  running: boolean;
  port: number | null;
  missingDependency: string | null; // slug d'une dépendance (requires) pas encore active
}

/**
 * Fait tourner les addons officiels "embarqués" (ceux buildés dans l'image,
 * cf. Dockerfile + addons/build-bundled.sh) comme de simples processus
 * enfants du process API — AUCUN accès Docker/VPS séparé nécessaire.
 *
 * Chaque addon écoute sur un port interne (`bundlePort`, 127.0.0.1
 * uniquement — jamais publié) ; le navigateur y accède via le reverse-proxy
 * `/addon-proxy/:slug/*` (cf. AddonProxyController) qui passe par le port
 * 8000 déjà exposé. `baseUrl` stocké en DB pour ces addons = ce chemin
 * relatif, pas une URL externe.
 */
@Injectable()
export class BundledAddonsService implements OnModuleDestroy {
  private readonly logger = new Logger(BundledAddonsService.name);
  private readonly processes = new Map<string, ChildProcess>();

  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
    private readonly addonsService: AddonsService,
  ) {}

  private registryEntry(slug: string): OfficialAddonEntry {
    const entry = loadOfficialAddons().find((e) => e.slug === slug);
    if (!entry) throw new BadRequestException(`Addon officiel inconnu : ${slug}`);
    if (!entry.bundlePort) throw new BadRequestException(`"${slug}" n'a pas de version embarquée disponible.`);
    return entry;
  }

  proxyBaseUrl(slug: string): string {
    return `/addon-proxy/${slug}`;
  }

  /** Port interne d'un addon embarqué EN COURS D'EXÉCUTION (pour le proxy) — null si arrêté. */
  runningPort(slug: string): number | null {
    if (!this.processes.has(slug)) return null;
    const entry = loadOfficialAddons().find((e) => e.slug === slug);
    return entry?.bundlePort ?? null;
  }

  async status(): Promise<BundledAddonStatus[]> {
    return loadOfficialAddons()
      .filter((e) => e.bundlePort)
      .map((e) => {
        const missingDependency = (e.requires ?? []).find((dep) => !this.processes.has(dep)) ?? null;
        return {
          slug: e.slug,
          available: isBundleAvailable(e.slug),
          running: this.processes.has(e.slug),
          port: e.bundlePort ?? null,
          missingDependency,
        };
      });
  }

  async activate(slug: string): Promise<{ addon: any }> {
    const entry = this.registryEntry(slug);
    if (!isBundleAvailable(slug)) {
      throw new BadRequestException(`"${slug}" n'est pas embarqué dans cette image (build absent).`);
    }
    for (const dep of entry.requires ?? []) {
      if (!this.processes.has(dep)) {
        throw new BadRequestException(`"${entry.name}" nécessite l'addon "${dep}" — activez-le d'abord.`);
      }
    }

    if (!this.processes.has(slug)) {
      await this.spawnAddon(entry);
    }

    // Connecte/rafraîchit l'entrée `Addon` (même logique que pour un addon
    // externe) — baseUrl pointe vers le proxy interne, jamais l'IP:port réel.
    const baseUrl = this.proxyBaseUrl(slug);
    const existing = await this.prisma.addon.findUnique({ where: { baseUrl } });
    const addon = existing
      ? await this.addonsService.update(existing.id, { enabled: true })
      : await this.addonsService.addAddon({ baseUrl });
    return { addon };
  }

  async deactivate(slug: string): Promise<void> {
    const dependents = loadOfficialAddons().filter(
      (e) => e.bundlePort && (e.requires ?? []).includes(slug) && this.processes.has(e.slug),
    );
    if (dependents.length) {
      throw new BadRequestException(
        `Désactivez d'abord : ${dependents.map((d) => d.name).join(', ')} (dépend${dependents.length > 1 ? 'ent' : ''} de "${slug}").`,
      );
    }

    this.killAddon(slug);
    const baseUrl = this.proxyBaseUrl(slug);
    const existing = await this.prisma.addon.findUnique({ where: { baseUrl } });
    if (existing) await this.addonsService.update(existing.id, { enabled: false });
  }

  /** Relance au boot tous les addons embarqués marqués `enabled` en DB (persistance à travers les redémarrages). */
  async restoreOnBoot(): Promise<void> {
    const entries = loadOfficialAddons().filter((e) => e.bundlePort && isBundleAvailable(e.slug));
    if (!entries.length) return;

    // Ordre de dépendance simple (une seule passe suffit ici — pas de graphe profond attendu).
    const sorted = [...entries].sort((a, b) => (a.requires?.length ?? 0) - (b.requires?.length ?? 0));
    for (const entry of sorted) {
      try {
        const row = await this.prisma.addon.findUnique({ where: { baseUrl: this.proxyBaseUrl(entry.slug) } });
        if (!row?.enabled) continue;
        const depsOk = (entry.requires ?? []).every((dep) => this.processes.has(dep));
        if (!depsOk) {
          this.logger.warn(`Redémarrage auto de "${entry.slug}" ignoré : dépendance non active.`);
          continue;
        }
        await this.spawnAddon(entry);
        this.logger.log(`Addon embarqué "${entry.slug}" relancé automatiquement (était activé avant redémarrage).`);
      } catch (e) {
        this.logger.error(`Échec du redémarrage auto de "${entry.slug}" : ${e}`);
      }
    }
  }

  private async spawnAddon(entry: OfficialAddonEntry): Promise<void> {
    const dir = bundledAddonDir(entry.slug);
    const dataDir = join(process.env.DATA_DIR ?? join(process.cwd(), 'data'), 'addons');
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

    const env: Record<string, string> = {
      ...process.env,
      PORT: String(entry.bundlePort),
      DB_PATH: join(dataDir, `${entry.slug}-data.json`),
      PANEL_URL: `http://127.0.0.1:${process.env.API_PORT ?? 8000}`,
      PANEL_API_KEY: this.settings.get('apiKey') || '',
      ...(entry.extraEnv ?? {}),
    };

    const child = spawn('node', [join(dir, 'api', 'dist', 'main.js')], {
      cwd: dir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (d) => this.logger.log(`[${entry.slug}] ${d.toString().trim()}`));
    child.stderr?.on('data', (d) => this.logger.warn(`[${entry.slug}] ${d.toString().trim()}`));
    child.on('exit', (code) => {
      this.logger.warn(`Addon embarqué "${entry.slug}" arrêté (code ${code}).`);
      this.processes.delete(entry.slug);
    });
    this.processes.set(entry.slug, child);

    await this.waitReady(entry.bundlePort!, entry.slug);
  }

  private async waitReady(port: number, slug: string): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/uhq-manifest.json`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) return;
      } catch {
        // pas encore prêt — on retente
      }
      await new Promise((r) => setTimeout(r, READY_POLL_MS));
    }
    this.killAddon(slug);
    throw new BadRequestException(`L'addon "${slug}" n'a pas démarré dans les temps.`);
  }

  private killAddon(slug: string): void {
    const child = this.processes.get(slug);
    if (!child) return;
    child.kill('SIGTERM');
    this.processes.delete(slug);
  }

  onModuleDestroy() {
    for (const [slug, child] of this.processes) {
      this.logger.log(`Arrêt de l'addon embarqué "${slug}" (arrêt du panel).`);
      child.kill('SIGTERM');
    }
  }
}
