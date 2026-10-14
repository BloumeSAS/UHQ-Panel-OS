import { randomBytes } from 'crypto';
import { Logger } from '@nestjs/common';
import { loadRuntimeConfig, saveRuntimeValue } from '../../database/db-config';

/**
 * Jeton d'installation — protège /setup (création du 1er admin, base, restauration) tant que
 * l'installation n'est PAS terminée, pour qu'un tiers ne prenne pas la main avant vous.
 *
 *  - Généré AUTOMATIQUEMENT au démarrage d'une installation vierge, conservé dans le dossier de
 *    données (stable entre redémarrages) et AFFICHÉ DANS LES LOGS du conteneur.
 *  - Une installation déjà terminée n'en a jamais : rien à refaire, aucun jeton demandé.
 *  - `SETUP_TOKEN=<valeur>` impose votre propre jeton ; `SETUP_TOKEN=off` désactive la protection.
 *  - Supprimé dès que l'installation est terminée.
 */
const OFF = new Set(['off', 'disabled', 'false', '0', 'none']);
let cached: string | null | undefined; // undefined = pas encore résolu

function resolve(): string | null {
  const env = (process.env.SETUP_TOKEN ?? '').trim();
  if (env) return OFF.has(env.toLowerCase()) ? null : env;
  const stored = (loadRuntimeConfig() as { setupToken?: string }).setupToken;
  return stored && stored.trim() ? stored.trim() : null;
}

/** Jeton attendu, ou null si l'installation n'est pas protégée. */
export function getSetupToken(): string | null {
  if (cached === undefined) cached = resolve();
  return cached;
}

export const setupTokenRequired = () => !!getSetupToken();

/** À appeler une fois l'installation terminée : le jeton n'a plus lieu d'être. */
export function clearSetupToken(): void {
  cached = null;
  try {
    saveRuntimeValue('setupToken', null);
  } catch {
    /* dossier de données non inscriptible : le jeton ne survivra pas au redémarrage, sans conséquence */
  }
}

/**
 * Au démarrage : `installed` = installation terminée (true), non terminée (false) ou inconnue (null,
 * base injoignable → traitée comme « à faire » : on échoue côté sûr). Génère/affiche le jeton si besoin.
 */
export function initSetupToken(installed: boolean | null): void {
  const log = new Logger('SetupToken');
  const env = (process.env.SETUP_TOKEN ?? '').trim();
  const forcedOff = env !== '' && OFF.has(env.toLowerCase());

  if (installed === true || forcedOff) {
    if (installed === true) clearSetupToken();
    else cached = null;
    return;
  }
  // `installed === null` (état inconnu, ex. base injoignable) : on protège par prudence, comme si
  // l'installation était à faire. Sur un panel en réalité déjà installé c'est sans effet (/setup reste
  // verrouillé) et le jeton est supprimé au prochain démarrage où l'état est connu.
  // Installation à faire : jeton imposé par l'env, déjà généré, ou nouveau.
  let token = resolve();
  const imposed = env !== '';
  if (!token) {
    token = randomBytes(12).toString('base64url');
    try {
      saveRuntimeValue('setupToken', token);
    } catch {
      /* gardé en mémoire seulement */
    }
  }
  cached = token;
  const line = '═'.repeat(62);
  log.warn(
    `\n${line}\n  INSTALLATION À FAIRE — l'écran /setup est protégé.\n` +
      (imposed
        ? '  Saisissez la valeur de votre variable SETUP_TOKEN.\n'
        : `  TOKEN D'INSTALLATION : ${token}\n  (à saisir dans l'écran d'installation ; supprimé une fois terminée)\n`) +
      `${line}`,
  );
  if (installed === null) log.warn("L'état de l'installation n'a pas pu être vérifié (base injoignable ?) : protection activée par prudence.");
}
