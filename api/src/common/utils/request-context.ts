import { AsyncLocalStorage } from 'async_hooks';

/**
 * Propage un ID de corrélation par requête à travers toute la pile d'appels
 * (services/DB/etc.) sans devoir le faire passer en paramètre partout — même
 * mécanisme que `i18nStorage` (cf. common/utils/i18n.ts). Rempli par
 * `RequestIdInterceptor`, lu par `RingBufferLogger` pour l'inclure dans
 * chaque ligne de log émise pendant la durée de vie de cette requête.
 */
export const requestIdStorage = new AsyncLocalStorage<string>();
