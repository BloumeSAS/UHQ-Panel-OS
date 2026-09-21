import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as fs from 'fs';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { PrismaService } from '../database/prisma.service';

/**
 * Health check. `/` est laissé au panel React (ServeStaticModule) ; le health
 * répond donc sur `/health` (et `/api/health`).
 */
@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(['health', 'api/health'])
  health() {
    return {
      status: 'running',
      service: 'UHQ Panel OS',
      company: 'Bloume SAS',
    };
  }

  /**
   * Diagnostic détaillé (admin) — descripteurs de fichiers ouverts,
   * connexions Postgres actives, plus grosses tables. Formalise ce qu'on a dû
   * vérifier à la main via SSH/psql lors des incidents EMFILE/bloat — pour du
   * monitoring externe sans repasser par le serveur à chaque fois.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('api/panel/health/detailed')
  async detailed() {
    let dbConnections: number | null = null;
    let largestTables: { table: string; sizeBytes: number; rows: number }[] = [];
    try {
      const [connRows, sizeRows] = await Promise.all([
        this.prisma.$queryRaw<{ count: bigint }[]>`
          SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
        `,
        this.prisma.$queryRaw<{ table: string; size_bytes: bigint; rows: bigint }[]>`
          SELECT relname AS table, pg_total_relation_size(relid) AS size_bytes, n_live_tup AS rows
          FROM pg_stat_user_tables
          ORDER BY pg_total_relation_size(relid) DESC
          LIMIT 15
        `,
      ]);
      dbConnections = Number(connRows[0]?.count ?? 0);
      largestTables = sizeRows.map((r) => ({ table: r.table, sizeBytes: Number(r.size_bytes), rows: Number(r.rows) }));
    } catch {
      // DB injoignable — le reste du diagnostic (process) reste utile.
    }

    return {
      status: 'success',
      data: {
        process: {
          uptimeSec: Math.round(process.uptime()),
          memoryRssBytes: process.memoryUsage().rss,
          openFileDescriptors: this.countOpenFds(),
        },
        database: {
          connected: dbConnections !== null,
          activeConnections: dbConnections,
          largestTables,
        },
      },
    };
  }

  /** `/proc/self/fd` n'existe que sous Linux (conteneur Docker en prod) — null ailleurs (dev local). */
  private countOpenFds(): number | null {
    try {
      return fs.readdirSync('/proc/self/fd').length;
    } catch {
      return null;
    }
  }
}
