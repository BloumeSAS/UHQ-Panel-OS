/**
 * Journal des connexions REFUSÉES (en mémoire, depuis le dernier démarrage) : « pourquoi ça ne marche pas ? ».
 * Borné de partout (événements par compte, nombre de comptes, journal global) et dédupliqué (même cause + même IP
 * en moins de 10 s = un seul événement avec un compteur) : une inondation de tentatives ne peut pas saturer la mémoire.
 */
export type FailureReason =
  | 'no_credentials'
  | 'unknown_user'
  | 'wrong_password'
  | 'blocked'
  | 'expired'
  | 'quota'
  | 'ip_not_allowed'
  | 'wrong_port'
  | 'domain_blocked'
  | 'vpn'
  | 'thread_limit'
  | 'no_upstream'
  | 'banned_ip';

export interface FailureEvent {
  ts: number;
  ip: string;
  reason: FailureReason;
  port: number;
  /** Précision utile : port attendu, domaine bloqué, limite de threads… */
  hint?: string;
  count: number;
}

export interface GlobalFailureEvent extends FailureEvent {
  /** Identifiant du compte (ou identifiant essayé, tronqué, si inconnu). */
  username: string;
  known: boolean;
}

const PER_ACCOUNT = 50;
const MAX_ACCOUNTS = 5000;
const GLOBAL_MAX = 300;
const DEDUPE_MS = 10_000;

export class FailureLog {
  private byUser = new Map<string, FailureEvent[]>();
  private global: GlobalFailureEvent[] = [];

  record(username: string, known: boolean, ev: Omit<FailureEvent, 'ts' | 'count'>): void {
    const now = Date.now();
    const user = username.slice(0, 40);

    if (known) {
      let list = this.byUser.get(user);
      if (!list) {
        if (this.byUser.size >= MAX_ACCOUNTS) {
          const oldest = this.byUser.keys().next().value;
          if (oldest !== undefined) this.byUser.delete(oldest);
        }
        list = [];
        this.byUser.set(user, list);
      }
      this.push(list, ev, now, PER_ACCOUNT);
    }

    const last = this.global[this.global.length - 1];
    const same = this.global.slice(-10).find((g) => g.username === user && g.reason === ev.reason && g.ip === ev.ip && now - g.ts < DEDUPE_MS);
    if (same) {
      same.count++;
      same.ts = now;
    } else {
      this.global.push({ ...ev, ts: now, count: 1, username: user, known });
      if (this.global.length > GLOBAL_MAX) this.global.splice(0, this.global.length - GLOBAL_MAX);
    }
    void last;
  }

  private push(list: FailureEvent[], ev: Omit<FailureEvent, 'ts' | 'count'>, now: number, max: number) {
    const dup = list.slice(-5).find((e) => e.reason === ev.reason && e.ip === ev.ip && now - e.ts < DEDUPE_MS);
    if (dup) {
      dup.count++;
      dup.ts = now;
      if (ev.hint) dup.hint = ev.hint;
      return;
    }
    list.push({ ...ev, ts: now, count: 1 });
    if (list.length > max) list.splice(0, list.length - max);
  }

  forUser(username: string, limit = 50): FailureEvent[] {
    return (this.byUser.get(username.slice(0, 40)) ?? []).slice(-limit).reverse();
  }

  recent(limit = 100): GlobalFailureEvent[] {
    return this.global.slice(-limit).reverse();
  }
}
