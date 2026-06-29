import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ProxyServerService } from '../proxy-engine/proxy-server.service';
import { assertPortAvailable } from '../../common/utils/port-validation';
import { normalizeDomain } from '../../common/utils/proxy-format';
import { CreatePoolDto, UpdatePoolDto } from './dto';

/** Tirage unique et stable dans [min,max] (min==max ⇒ valeur fixe). */
function rollFakeCount(min: number, max: number): number {
  if (min >= max) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

function parseFakeCountries(fakeCountries: string | null | undefined): string[] {
  return (fakeCountries ?? '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

/** Tire un nombre d'IP indépendant pour CHAQUE pays — pas un total partagé à répartir. */
function rollAllCountries(countries: string[], min: number, max: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of countries) out[c] = rollFakeCount(min, max);
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
    const countries = parseFakeCountries(dto.fakeCountries);
    const fakeIpCountByCountry =
      countries.length && dto.fakeIpCountMin != null && dto.fakeIpCountMax != null
        ? rollAllCountries(countries, dto.fakeIpCountMin, dto.fakeIpCountMax)
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
        fakeIpCountMin: dto.fakeIpCountMin ?? null,
        fakeIpCountMax: dto.fakeIpCountMax ?? null,
        fakeIpCountByCountry,
      },
    });
    if (dto.port != null) this.engine.invalidatePortCache();
    return pool;
  }

  async update(id: string, dto: UpdatePoolDto) {
    if (dto.port != null) await assertPortAvailable(this.prisma, dto.port, { table: 'pool', id });

    // Re-tirage par pays — UNIQUEMENT si la plage ou la liste de pays change :
    // - plage changée → tout le monde est re-tiré dans la nouvelle plage.
    // - seule la liste change → les pays déjà présents gardent leur valeur
    //   (stable), les nouveaux sont tirés, ceux retirés disparaissent.
    // Sauvegarder le formulaire sans rien changer ne doit jamais relancer un
    // tirage (sinon les chiffres affichés sauteraient à chaque "Enregistrer").
    let fakeIpCountByCountry: Record<string, number> | undefined;
    if (dto.fakeIpCountMin !== undefined || dto.fakeIpCountMax !== undefined || dto.fakeCountries !== undefined) {
      const existing = await this.prisma.proxyPool.findUnique({ where: { id } });
      const min = dto.fakeIpCountMin !== undefined ? dto.fakeIpCountMin : existing?.fakeIpCountMin ?? null;
      const max = dto.fakeIpCountMax !== undefined ? dto.fakeIpCountMax : existing?.fakeIpCountMax ?? null;
      const countries = parseFakeCountries(
        dto.fakeCountries !== undefined ? dto.fakeCountries : existing?.fakeCountries,
      );
      const rangeChanged =
        min !== (existing?.fakeIpCountMin ?? null) || max !== (existing?.fakeIpCountMax ?? null);

      if (min == null || max == null || countries.length === 0) {
        fakeIpCountByCountry = {};
      } else if (rangeChanged) {
        fakeIpCountByCountry = rollAllCountries(countries, min, max);
      } else {
        const existingMap = (existing?.fakeIpCountByCountry as Record<string, number> | null) ?? {};
        fakeIpCountByCountry = {};
        for (const c of countries) fakeIpCountByCountry[c] = existingMap[c] ?? rollFakeCount(min, max);
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
          ...(dto.fakeIpCountMin !== undefined && { fakeIpCountMin: dto.fakeIpCountMin }),
          ...(dto.fakeIpCountMax !== undefined && { fakeIpCountMax: dto.fakeIpCountMax }),
          ...(fakeIpCountByCountry !== undefined && { fakeIpCountByCountry }),
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
    const countries = parseFakeCountries(existing.fakeCountries);
    const { fakeIpCountMin: min, fakeIpCountMax: max } = existing;
    const fakeIpCountByCountry =
      countries.length && min != null && max != null ? rollAllCountries(countries, min, max) : {};
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
