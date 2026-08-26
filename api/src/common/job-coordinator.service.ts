import { Injectable, Logger } from '@nestjs/common';

export type BackgroundJobName = 'scraper' | 'checker';

/**
 * Coordination entre les tâches de fond lourdes (scraper, checker) qui
 * tournent dans le même process que le moteur proxy live (:990).
 *
 * Contexte : plusieurs redémarrages/crashes en prod ont été causés par le
 * scraper et le checker tournant EN MÊME TEMPS (chacun peut charger et
 * traiter jusqu'à ~150k proxies) — pic de RAM/CPU cumulé qui a fait sauter
 * le process. Ce service garantit qu'un seul des deux tourne à la fois ; la
 * sauvegarde (BackupService) consulte aussi `isAnyRunning()` pour attendre
 * une fenêtre calme avant de démarrer.
 */
@Injectable()
export class JobCoordinatorService {
  private readonly logger = new Logger(JobCoordinatorService.name);
  private running = new Set<BackgroundJobName>();

  isRunning(name: BackgroundJobName): boolean {
    return this.running.has(name);
  }

  isAnyRunning(exclude?: BackgroundJobName): boolean {
    for (const j of this.running) {
      if (j !== exclude) return true;
    }
    return false;
  }

  /**
   * Attend que `name` ne soit pas en conflit avec un autre job de fond en
   * cours, puis le marque "en cours" et retourne `true`. Si `maxWaitMs` est
   * dépassé, abandonne et retourne `false` (à l'appelant de sauter ce cycle
   * plutôt que de bloquer indéfiniment — le prochain cycle planifié réessaiera).
   */
  async acquireExclusive(
    name: BackgroundJobName,
    conflictsWith: BackgroundJobName[],
    opts: { maxWaitMs?: number; pollMs?: number } = {},
  ): Promise<boolean> {
    const maxWaitMs = opts.maxWaitMs ?? 30 * 60_000;
    const pollMs = opts.pollMs ?? 5_000;
    const deadline = Date.now() + maxWaitMs;
    let waited = false;

    while (conflictsWith.some((j) => this.running.has(j))) {
      if (Date.now() >= deadline) {
        this.logger.warn(
          `${name} a attendu ${Math.round(maxWaitMs / 1000)}s sans que ${conflictsWith.join('/')} ne se libère — cycle sauté.`,
        );
        return false;
      }
      if (!waited) {
        this.logger.log(`${name} en attente : ${conflictsWith.filter((j) => this.running.has(j)).join('/')} en cours.`);
        waited = true;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }

    if (waited) this.logger.log(`${name} démarre (plus de conflit).`);
    this.running.add(name);
    return true;
  }

  release(name: BackgroundJobName): void {
    this.running.delete(name);
  }
}
