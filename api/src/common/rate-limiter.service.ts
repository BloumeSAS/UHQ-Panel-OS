import { Injectable } from '@nestjs/common';

/**
 * Limiteur de débit générique en mémoire (fenêtre glissante) — pas de
 * dépendance externe (`@nestjs/throttler` n'est pas installé), cohérent avec
 * les autres trackers maison de ce projet (JobCoordinatorService,
 * BackupService.manualRun). Utilisé pour freiner le brute-force sur
 * `/auth/login` et `/auth/forgot-password`, qui n'ont sinon aucune
 * protection tant que le captcha n'est pas configuré (`captchaProvider`).
 */
@Injectable()
export class RateLimiterService {
  private hits = new Map<string, number[]>();

  constructor() {
    // Purge périodique pour ne pas accumuler indéfiniment des clés mortes
    // (une IP/email qui ne retente plus jamais reste sinon en mémoire pour toujours).
    setInterval(() => this.sweep(), 10 * 60_000).unref();
  }

  /** true = requête autorisée (et comptée) ; false = throttled. */
  check(key: string, maxAttempts: number, windowMs: number): boolean {
    const now = Date.now();
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= maxAttempts) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, arr] of this.hits) {
      const fresh = arr.filter((t) => now - t < 10 * 60_000);
      if (fresh.length === 0) this.hits.delete(key);
      else this.hits.set(key, fresh);
    }
  }
}
