/**
 * Catalogue des extensions disponibles — données pures (aucun import de
 * module NestJS ici), pour rester importable depuis `extensions.service.ts`
 * (panel) SANS entraîner tout le graphe applicatif. Le lien clé → module
 * NestJS réel vit séparément dans `extension-modules.ts`, importé
 * uniquement par `app.module.ts` (le seul endroit qui a besoin d'assembler
 * le graphe).
 *
 * Toutes les extensions listées ici sont DÉJÀ dans l'image Docker (code
 * compilé au build), jamais téléchargées à la volée — activer/désactiver ne
 * fait que changer si leur module NestJS est inclus au prochain démarrage.
 */
export interface ExtensionMeta {
  key: string;
  nameKey: string;
  descKey: string;
  version: string;
}

export const EXTENSION_REGISTRY: ExtensionMeta[] = [
  {
    key: 'prometheus-metrics',
    nameKey: 'extensions.prometheusMetrics',
    descKey: 'extensions.prometheusMetricsDesc',
    version: '1.0.0',
  },
];

export const EXTENSION_KEYS = EXTENSION_REGISTRY.map((e) => e.key);
