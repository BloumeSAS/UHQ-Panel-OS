import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ProxyServerService } from '../proxy-engine/proxy-server.service';
import { isValidIp } from '../../common/utils/ip-validation';

@Injectable()
export class BannedIpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly proxyServer: ProxyServerService,
  ) {}

  async list() {
    return this.prisma.bannedIp.findMany({ orderBy: { createdAt: 'desc' } });
  }

  /** Bannit une ou plusieurs IP en une fois (upsert — re-bannir met à jour raison/expiration). */
  async banMany(ips: string[], reason: string | undefined, expiresAt: string | undefined, createdBy: string | undefined) {
    const clean = Array.from(new Set(ips.map((ip) => ip.trim()).filter(Boolean)));
    if (clean.length === 0) throw new BadRequestException('Aucune IP fournie');

    const invalid = clean.filter((ip) => !isValidIp(ip));
    if (invalid.length > 0) {
      throw new BadRequestException(`IP invalide(s) : ${invalid.join(', ')}`);
    }

    let expiry: Date | null = null;
    if (expiresAt) {
      expiry = new Date(expiresAt);
      if (Number.isNaN(expiry.getTime())) throw new BadRequestException("Date d'expiration invalide");
    }

    const results = await Promise.all(
      clean.map((ip) =>
        this.prisma.bannedIp.upsert({
          where: { ip },
          create: { ip, reason: reason || null, expiresAt: expiry, createdBy: createdBy || null },
          update: { reason: reason || null, expiresAt: expiry, createdBy: createdBy || null },
        }),
      ),
    );
    this.proxyServer.invalidateBanCache();
    return results;
  }

  async unban(id: string): Promise<void> {
    await this.prisma.bannedIp.delete({ where: { id } }).catch(() => undefined);
    this.proxyServer.invalidateBanCache();
  }

  async unbanMany(ids: string[]): Promise<number> {
    const res = await this.prisma.bannedIp.deleteMany({ where: { id: { in: ids } } });
    this.proxyServer.invalidateBanCache();
    return res.count;
  }
}
