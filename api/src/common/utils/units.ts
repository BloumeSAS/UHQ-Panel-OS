/**
 * Unité "Go" du panel (v2.4.65) : Go DÉCIMAL, comme les fournisseurs de
 * proxies (1 Go = 1 000 000 000 octets). Avant : Gio (1024³), soit ~7 % de
 * moins affiché que chez le reseller pour la même consommation.
 *
 * Toute conversion octets ↔ Go (quotas, `usedGb`/`totalGb`, affichages,
 * API legacy) passe par cette constante — ne plus écrire `1024 ** 3`.
 */
export const BYTES_PER_GB = 1_000_000_000;

/** Ancienne unité (Gio) — uniquement pour la conversion unique des données existantes. */
export const LEGACY_BYTES_PER_GB = 1024 ** 3;
