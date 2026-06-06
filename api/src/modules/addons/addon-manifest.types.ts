/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Format du manifest UHQ Panel OS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * L'addon expose ce fichier à : <baseUrl>/uhq-manifest.json
 * Le panel le lit, le met en cache, et injecte les pages/nav items.
 *
 * Exemple minimal :
 * {
 *   "name": "Boutique",
 *   "version": "1.0.0",
 *   "icon": "ShoppingBag",
 *   "pages": [
 *     { "path": "/", "label": "Boutique", "showInNavbar": true }
 *   ]
 * }
 *
 * Le panel ouvrira les pages sous la forme :
 *   <baseUrl><page.path>?token=<jwt>&lang=<lang>&theme=<dark|light>
 *
 * L'addon peut utiliser le JWT pour appeler l'API du panel :
 *   Authorization: Bearer <token>  →  /api/panel/*
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface AddonPage {
  /** Chemin relatif sur l'addon, ex. "/" ou "/admin" */
  path: string;
  /**
   * Libellé affiché dans la nav.
   * Peut être une clé i18n (ex. "addon.wallet.nav") déclarée dans manifest.translations.
   * Si la clé n'existe pas dans les traductions, le texte est affiché tel quel.
   */
  label: string;
  /** Icône Lucide (optionnelle, hérite de manifest.icon sinon) */
  icon?: string;
  /** Afficher dans la barre de navigation ? (défaut : true) */
  showInNavbar?: boolean;
  /** Réservé aux admins ? (défaut : false) */
  adminOnly?: boolean;
}

export interface AddonWidget {
  /**
   * Zone d'injection dans le panel.
   * Zones disponibles : "subuser-balance"
   * (d'autres zones peuvent être ajoutées dans le panel core).
   */
  zone: string;
  /** Chemin relatif sur l'addon pour ce widget iframe */
  path: string;
  /** Hauteur de l'iframe en px (défaut : 40) */
  height?: number;
  /**
   * Clés de contexte passées en query params à l'iframe.
   * Ex. ["userId", "username"] → ?userId=xxx&username=yyy
   */
  passContext?: string[];
}

export interface AddonAuthor {
  /** Nom de l'auteur ou de l'organisation */
  name: string;
  /** Email de contact (optionnel) */
  email?: string;
  /** Site web de l'auteur (optionnel) */
  url?: string;
}

/**
 * Slot UI : item injecté dans une zone native du panel.
 *
 * Zones disponibles :
 *   "topbar"  → dropdown en haut à droite (à côté du bouton déconnexion)
 *
 * D'autres zones peuvent être ajoutées ultérieurement sans modifier le core.
 */
export interface AddonSlot {
  /** Zone cible dans l'interface du panel */
  zone: 'topbar' | string;
  /** Label affiché (clé i18n ou texte direct) */
  label: string;
  /** Icône Lucide */
  icon?: string;
  /** Chemin de la page addon à ouvrir au clic */
  page: string;
  /** Réservé aux admins ? (défaut : false) */
  adminOnly?: boolean;
}

export interface AddonManifest {
  /** Nom de l'addon */
  name: string;
  /** Version semver */
  version?: string;
  /** Description courte */
  description?: string;
  /** Icône Lucide par défaut */
  icon?: string;
  /**
   * Auteur — peut être une chaîne "Nom <email>" ou un objet { name, email, url }.
   */
  author?: AddonAuthor | string;
  /** URL de la page d'accueil / documentation de l'addon */
  homepage?: string;
  /** URL du dépôt source */
  repository?: string;
  /** Licence SPDX (ex. "MIT", "Apache-2.0") */
  license?: string;
  /** Pages complètes intégrées en iframe pleine page */
  pages: AddonPage[];
  /**
   * Traductions fusionnées dans le panel au runtime.
   * Format : { "fr": { "addon.wallet.nav": "Mon solde" }, "en": { ... } }
   * Utilisées pour les labels de nav (si label = clé i18n) et tout texte panel.
   */
  translations?: Record<string, Record<string, string>>;
  /**
   * Widgets injectés dans des zones du panel (micro-iframes).
   */
  widgets?: AddonWidget[];
  /**
   * Slots UI : items injectés dans des zones natives du panel.
   * Ex. un bouton "Mon solde" dans le dropdown topbar.
   */
  slots?: AddonSlot[];
  /**
   * Intégration avec le système de backup du panel.
   * Quand le panel lance un backup, il appelle exportEndpoint pour récupérer
   * les données de l'addon et les inclure dans le fichier de sauvegarde.
   * Lors d'une restauration, il appelle importEndpoint avec ces données.
   */
  backup?: {
    /** GET <baseUrl><exportEndpoint> → retourne les données à sauvegarder */
    exportEndpoint: string;
    /** POST <baseUrl><importEndpoint> body=données → restaure les données */
    importEndpoint?: string;
    /** Header d'auth envoyé par le panel (défaut : X-Panel-Key) */
    authHeader?: string;
  };
  /** Version minimale du panel requise */
  panelVersion?: string;
  auth?: {
    passJwt?: boolean;
    passUserInfo?: boolean;
  };
}
