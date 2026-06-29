import { Injectable, NotFoundException } from '@nestjs/common';
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
}
