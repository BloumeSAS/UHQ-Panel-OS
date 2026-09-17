import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Response } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from '../../config/settings.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Contrairement au ring buffer de logs (2000 entrées) et aux fichiers
   * (rotation 30 jours), `AuditLog` n'avait aucune rétention — la table
   * grossissait indéfiniment. Nettoyage quotidien des lignes plus vieilles
   * que `auditLogRetentionMonths` (défaut 12 mois, réglable).
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldEntries(): Promise<void> {
    try {
      const months = this.settings.getPositiveNumber('auditLogRetentionMonths') || 12;
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - months);
      const res = await this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
      if (res.count > 0) {
        this.logger.log(`Purge AuditLog : ${res.count} ligne(s) de plus de ${months} mois supprimée(s).`);
      }
    } catch (e) {
      this.logger.error(`Échec de la purge AuditLog : ${e}`);
    }
  }

  async log(entry: {
    userId?: string;
    userEmail?: string;
    action: string;
    target?: string;
    details?: Record<string, any>;
    ip?: string;
  }) {
    await this.prisma.auditLog.create({
      data: {
        userId: entry.userId,
        userEmail: entry.userEmail,
        action: entry.action,
        target: entry.target,
        details: entry.details ? JSON.stringify(entry.details) : null,
        ip: entry.ip,
      },
    });
  }

  private buildWhere(filters: { action?: string; userEmail?: string; from?: string; to?: string }) {
    const where: any = {};
    if (filters.action) where.action = { contains: filters.action };
    if (filters.userEmail) where.userEmail = { contains: filters.userEmail };
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }
    return where;
  }

  async findAll(page = 1, limit = 50, filters: { action?: string; userEmail?: string; from?: string; to?: string } = {}) {
    const skip = (page - 1) * limit;
    const where = this.buildWhere(filters);
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  private csvEscape(v: unknown): string {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  /**
   * Exporte TOUT le résultat filtré (pas seulement la page affichée) en CSV,
   * streamé directement dans la réponse HTTP par lots de 1000 lignes — jamais
   * tout chargé en mémoire d'un coup, même sur un très gros historique.
   */
  async streamCsv(res: Response, filters: { action?: string; userEmail?: string; from?: string; to?: string } = {}): Promise<void> {
    const where = this.buildWhere(filters);
    res.write('id,user_email,action,target,ip,created_at\n');
    const BATCH = 1000;
    let cursorId: string | null = null;
    for (;;) {
      const batch = await this.prisma.auditLog.findMany({
        where,
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      });
      if (batch.length === 0) break;
      for (const l of batch) {
        res.write(
          [l.id, l.userEmail ?? '', l.action, l.target ?? '', l.ip ?? '', l.createdAt.toISOString()]
            .map((v) => this.csvEscape(v))
            .join(',') + '\n',
        );
      }
      cursorId = batch[batch.length - 1].id;
      if (batch.length < BATCH) break;
    }
    res.end();
  }
}
