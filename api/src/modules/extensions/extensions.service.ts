import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { EXTENSION_REGISTRY } from './extension-registry';

/** Délai avant `process.exit(0)` — laisse le temps à la réponse HTTP de partir avant que Docker relance le process. */
const RESTART_DELAY_MS = 1200;

@Injectable()
export class ExtensionsService {
  private readonly logger = new Logger(ExtensionsService.name);
  private restartScheduledAt: number | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Catalogue + état ON/OFF actuellement chargé (= au dernier boot, pas forcément ce qui est écrit en DB si un restart est en attente). */
  async list() {
    const rows = await this.prisma.extension.findMany();
    const enabledInDb = new Set(rows.filter((r) => r.enabled).map((r) => r.key));
    return EXTENSION_REGISTRY.map((meta) => ({
      ...meta,
      // "enabled" = état voulu (DB) ; "active" = état réellement chargé dans
      // le process en cours (résolu au boot, cf. main.ts) — les deux
      // divergent tant qu'un restart n'a pas eu lieu après un toggle.
      enabled: enabledInDb.has(meta.key),
      active: global.__UHQ_ACTIVE_EXTENSIONS__?.has(meta.key) ?? false,
      restartPending: this.restartScheduledAt != null,
    }));
  }

  /** true tant qu'un restart a été programmé et n'a pas encore eu lieu (le process est toujours en vie). */
  isRestartPending(): boolean {
    return this.restartScheduledAt != null;
  }

  async setEnabled(key: string, enabled: boolean): Promise<{ restarting: boolean }> {
    if (!EXTENSION_REGISTRY.some((e) => e.key === key)) {
      throw new BadRequestException(`Extension inconnue : ${key}`);
    }
    await this.prisma.extension.upsert({
      where: { key },
      create: { key, enabled },
      update: { enabled },
    });

    const active = global.__UHQ_ACTIVE_EXTENSIONS__?.has(key) ?? false;
    if (active === enabled) {
      // Déjà dans l'état demandé côté process en cours (ex. réactiver une
      // extension déjà chargée avant qu'un restart précédent n'ait eu lieu)
      // — rien à redémarrer.
      return { restarting: false };
    }

    this.logger.warn(`Extension "${key}" ${enabled ? 'activée' : 'désactivée'} — redémarrage programmé dans ${RESTART_DELAY_MS}ms.`);
    this.restartScheduledAt = Date.now();
    setTimeout(() => process.exit(0), RESTART_DELAY_MS).unref();
    return { restarting: true };
  }
}
