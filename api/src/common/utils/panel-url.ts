import { SettingsService } from '../../config/settings.service';

/** Hôte par défaut du produit : ne JAMAIS l'utiliser pour des liens e-mail (le jeton partirait vers ce domaine). */
const DEFAULT_PUBLIC_HOST = 'prx.uhq.monster';

/**
 * URL publique du PANEL (liens des e-mails de réinitialisation / invitation).
 * Vient UNIQUEMENT de la configuration (jamais de l'en-tête Host de la requête :
 * sinon un attaquant ferait envoyer à la victime un lien vers son propre site).
 * Repli : https://<hôte public du proxy> ; `null` si celui-ci est encore la valeur
 * par défaut du produit (aucun lien sûr à construire).
 */
export function panelBaseUrl(settings: SettingsService): string | null {
  const configured = settings.get('panelUrl').trim().replace(/\/+$/, '');
  if (/^https?:\/\/[^\s/?#]+$/i.test(configured)) return configured;
  const host = settings.get('publicProxyHost').trim();
  if (!host || host === DEFAULT_PUBLIC_HOST) return null;
  return `https://${host}`;
}
