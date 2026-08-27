import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ProxyServerService } from '../proxy-engine/proxy-server.service';
import { assertPortAvailable } from '../../common/utils/port-validation';
import { normalizeDomain } from '../../common/utils/proxy-format';
import { parseCountryCodes, rollFakeCount, sameCountrySet, splitRangeForPriority } from '../../common/utils/fake-stats';
import { CreatePoolDto, UpdatePoolDto } from './dto';

/** Tire un nombre d'IP indépendant pour CHAQUE pays — pas un total partagé à répartir. */
function rollAllCountries(countries: string[], min: number, max: number, priority: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of countries) {
    const [subMin, subMax] = splitRangeForPriority(min, max, priority.includes(c));
    out[c] = rollFakeCount(subMin, subMax);
  }
  return out;
}

@Injectable()
export class ProxyPoolsService {
  private readonly logger = new Logger(ProxyPoolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ProxyServerService,
  ) {}

  findAll() {
    return this.prisma.proxyPool.findMany({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreatePoolDto) {
    if (dto.port != null) await assertPortAvailable(this.prisma, dto.port);
    const countries = parseCountryCodes(dto.fakeCountries);
    const priority = parseCountryCodes(dto.fakePriorityCountries);
    const fakeIpCountByCountry =
      countries.length && dto.fakeIpCountMin != null && dto.fakeIpCountMax != null
        ? rollAllCountries(countries, dto.fakeIpCountMin, dto.fakeIpCountMax, priority)
        : {};
    const pool = await this.prisma.proxyPool.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        color: dto.color || '#6366f1',
        port: dto.port ?? null,
        domain: dto.domain ? normalizeDomain(dto.domain) || null : null,
        alwaysOnline: dto.alwaysOnline ?? false,
        checkerEnabled: dto.checkerEnabled ?? true,
        fakeCountries: dto.fakeCountries || null,
        fakePriorityCountries: dto.fakePriorityCountries || null,
        fakeIpCountMin: dto.fakeIpCountMin ?? null,
        fakeIpCountMax: dto.fakeIpCountMax ?? null,
        fakeIpCountByCountry,
        fakeIpRotateSeconds: dto.fakeIpRotateSeconds ?? null,
      },
    });
    if (dto.port != null) this.engine.invalidatePortCache();
    return pool;
  }

  async update(id: string, dto: UpdatePoolDto) {
    if (dto.port != null) await assertPortAvailable(this.prisma, dto.port, { table: 'pool', id });

    // Re-tirage par pays — UNIQUEMENT si la plage, la liste de pays, ou la
    // liste de pays prioritaires change :
    // - plage ou priorité changée → tout le monde est re-tiré (la priorité
    //   change la sous-plage de chaque pays, donc ses anciennes valeurs ne
    //   respectent plus forcément la garantie prioritaire > non-prioritaire).
    // - seule la liste de pays change → les pays déjà présents gardent leur
    //   valeur (stable), les nouveaux sont tirés, ceux retirés disparaissent.
    // Sauvegarder le formulaire sans rien changer ne doit jamais relancer un
    // tirage (sinon les chiffres affichés sauteraient à chaque "Enregistrer").
    let fakeIpCountByCountry: Record<string, number> | undefined;
    if (
      dto.fakeIpCountMin !== undefined ||
      dto.fakeIpCountMax !== undefined ||
      dto.fakeCountries !== undefined ||
      dto.fakePriorityCountries !== undefined
    ) {
      const existing = await this.prisma.proxyPool.findUnique({ where: { id } });
      const min = dto.fakeIpCountMin !== undefined ? dto.fakeIpCountMin : existing?.fakeIpCountMin ?? null;
      const max = dto.fakeIpCountMax !== undefined ? dto.fakeIpCountMax : existing?.fakeIpCountMax ?? null;
      const countries = parseCountryCodes(
        dto.fakeCountries !== undefined ? dto.fakeCountries : existing?.fakeCountries,
      );
      const priority = parseCountryCodes(
        dto.fakePriorityCountries !== undefined ? dto.fakePriorityCountries : existing?.fakePriorityCountries,
      );
      const rangeChanged =
        min !== (existing?.fakeIpCountMin ?? null) || max !== (existing?.fakeIpCountMax ?? null);
      const priorityChanged = !sameCountrySet(priority, parseCountryCodes(existing?.fakePriorityCountries));

      if (min == null || max == null || countries.length === 0) {
        fakeIpCountByCountry = {};
      } else if (rangeChanged || priorityChanged) {
        fakeIpCountByCountry = rollAllCountries(countries, min, max, priority);
      } else {
        const existingMap = (existing?.fakeIpCountByCountry as Record<string, number> | null) ?? {};
        fakeIpCountByCountry = {};
        for (const c of countries) {
          if (existingMap[c] !== undefined) {
            fakeIpCountByCountry[c] = existingMap[c];
          } else {
            const [subMin, subMax] = splitRangeForPriority(min, max, priority.includes(c));
            fakeIpCountByCountry[c] = rollFakeCount(subMin, subMax);
          }
        }
      }
    }

    try {
      const pool = await this.prisma.proxyPool.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.description !== undefined && { description: dto.description.trim() || null }),
          ...(dto.color !== undefined && { color: dto.color }),
          ...(dto.port !== undefined && { port: dto.port }),
          ...(dto.domain !== undefined && { domain: dto.domain ? normalizeDomain(dto.domain) || null : null }),
          ...(dto.alwaysOnline !== undefined && { alwaysOnline: dto.alwaysOnline }),
          ...(dto.checkerEnabled !== undefined && { checkerEnabled: dto.checkerEnabled }),
          ...(dto.fakeCountries !== undefined && { fakeCountries: dto.fakeCountries || null }),
          ...(dto.fakePriorityCountries !== undefined && { fakePriorityCountries: dto.fakePriorityCountries || null }),
          ...(dto.fakeIpCountMin !== undefined && { fakeIpCountMin: dto.fakeIpCountMin }),
          ...(dto.fakeIpCountMax !== undefined && { fakeIpCountMax: dto.fakeIpCountMax }),
          ...(fakeIpCountByCountry !== undefined && { fakeIpCountByCountry }),
          ...(dto.fakeIpRotateSeconds !== undefined && { fakeIpRotateSeconds: dto.fakeIpRotateSeconds }),
        },
      });
      if (dto.port !== undefined) this.engine.invalidatePortCache();
      return pool;
    } catch {
      throw new NotFoundException('Pool introuvable');
    }
  }

  /** Force un nouveau tirage par pays dans la plage déjà configurée — bouton "Régénérer" du panel. */
  async rerollFakeIps(id: string) {
    const existing = await this.prisma.proxyPool.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pool introuvable');
    const countries = parseCountryCodes(existing.fakeCountries);
    const priority = parseCountryCodes(existing.fakePriorityCountries);
    const { fakeIpCountMin: min, fakeIpCountMax: max } = existing;
    const fakeIpCountByCountry =
      countries.length && min != null && max != null ? rollAllCountries(countries, min, max, priority) : {};
    return this.prisma.proxyPool.update({ where: { id }, data: { fakeIpCountByCountry } });
  }

  async remove(id: string) {
    try {
      const pool = await this.prisma.proxyPool.delete({ where: { id } });
      if (pool.port != null) this.engine.invalidatePortCache();
      return pool;
    } catch {
      throw new NotFoundException('Pool introuvable');
    }
  }

  // Suivi en mémoire du "vidage" en cours par pool (pas de persistance
  // nécessaire — un redémarrage remet simplement l'état à zéro, comme le
  // suivi de sauvegarde manuelle dans BackupService).
  private clearRuns = new Map<
    string,
    { running: boolean; deleted: number; startedAt: number; finishedAt?: number; error?: string }
  >();

  /**
   * Déclenche la suppression de TOUS les `BackendProxy` de cette pool
   * (bouton "Vider la catégorie" du panel) EN TÂCHE DE FOND, sans attendre
   * la fin — même raison que `BackupService.triggerManualBackup` : sur une
   * catégorie très fournie (scraper actif depuis longtemps, potentiellement
   * des dizaines/centaines de milliers de lignes), attendre la fin avant de
   * répondre HTTP peut dépasser le timeout du reverse-proxy devant l'API en
   * prod (Traefik/Coolify) — observé : 500 générique sans diagnostic. Le
   * panel poll désormais `getClearStatus()` pour suivre la progression réelle.
   *
   * La suppression elle-même se fait par lots de 5000 ids (pas un unique
   * `deleteMany` géant) : chaque lot reste rapide même si la pool entière
   * est énorme, et une erreur en cours de route n'annule pas ce qui a déjà
   * été supprimé.
   */
  triggerClearProxies(id: string): { started: boolean; message?: string } {
    const existing = this.clearRuns.get(id);
    if (existing?.running) {
      return { started: false, message: 'Un vidage de cette catégorie est déjà en cours.' };
    }
    this.clearRuns.set(id, { running: true, deleted: 0, startedAt: Date.now() });
    this.runClearProxies(id).catch(() => undefined);
    return { started: true };
  }

  getClearStatus(id: string) {
    return this.clearRuns.get(id) ?? { running: false, deleted: 0, startedAt: 0 };
  }

  private async runClearProxies(id: string): Promise<void> {
    const state = this.clearRuns.get(id)!;
    const BATCH_SIZE = 5000;
    try {
      const pool = await this.prisma.proxyPool.findUnique({ where: { id } });
      if (!pool) throw new Error('Pool introuvable');

      for (;;) {
        const batch = await this.prisma.backendProxy.findMany({
          where: { pool: pool.name },
          select: { id: true },
          take: BATCH_SIZE,
        });
        if (batch.length === 0) break;
        const result = await this.prisma.backendProxy.deleteMany({
          where: { id: { in: batch.map((p) => p.id) } },
        });
        state.deleted += result.count;
        if (batch.length < BATCH_SIZE) break;
      }
      state.running = false;
      state.finishedAt = Date.now();
      this.logger.log(`Pool "${pool.name}" vidée : ${state.deleted} proxy(s) supprimé(s).`);
    } catch (err: any) {
      state.running = false;
      state.finishedAt = Date.now();
      state.error = String(err?.message ?? err);
      this.logger.error(
        `Échec du vidage de la pool ${id} (${state.deleted} déjà supprimés avant l'erreur) : ${state.error}`,
      );
    }
  }
}
