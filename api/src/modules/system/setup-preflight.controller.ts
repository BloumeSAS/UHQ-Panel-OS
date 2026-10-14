import { Controller, Get, HttpException, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { SetupTokenGuard } from '../../common/guards/setup-token.guard';
import { SystemService } from './system.service';

/** Vérification de configuration pendant l'installation (publique tant que l'installation n'est pas terminée). */
@ApiTags('panel-setup-preflight')
@UseGuards(SetupTokenGuard)
@Controller('api/panel/setup/preflight')
export class SetupPreflightController {
  private hits: number[] = [];

  constructor(
    private readonly system: SystemService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async run(@Query('host') host = '', @Query('port') port = '990') {
    // Verrouillé dès que l'installation est terminée (même règle que la création du 1er admin).
    const meta = await this.prisma.appMeta.findUnique({ where: { id: 'singleton' } }).catch(() => null);
    const admins = await this.prisma.panelUser.count({ where: { role: 'ADMIN' } }).catch(() => 0);
    if (meta?.setupCompleted && admins > 0) throw new HttpException('LOCKED', HttpStatus.FORBIDDEN);

    // 20 vérifications / minute au total (résolutions DNS + connexions sortantes : pas un outil à tout faire).
    const now = Date.now();
    this.hits = this.hits.filter((t) => now - t < 60_000);
    if (this.hits.length >= 20) throw new HttpException('TOO_MANY', HttpStatus.TOO_MANY_REQUESTS);
    this.hits.push(now);

    const h = String(host).trim().toLowerCase();
    // Nom d'hôte ou IP uniquement (pas d'URL, de chemin ni d'espace).
    if (h && !/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/.test(h)) throw new HttpException('BAD_HOST', HttpStatus.BAD_REQUEST);
    const p = Number(port);
    if (!Number.isInteger(p) || p < 1 || p > 65535) throw new HttpException('BAD_PORT', HttpStatus.BAD_REQUEST);
    return { status: 'success', ...(await this.system.preflight(h, p)) };
  }
}
