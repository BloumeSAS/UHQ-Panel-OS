import { Type } from '@nestjs/common';
import { MetricsModule } from './metrics/metrics.module';

/**
 * Lien clé (`ExtensionMeta.key`) → module NestJS réel. Importé UNIQUEMENT
 * par `app.module.ts` — c'est le seul endroit où le coût d'import de
 * l'extension (son code, ses dépendances) doit être payé, que l'extension
 * soit activée ou non (le code est toujours dans l'image Docker ; seul le
 * *chargement dans le graphe NestJS* dépend de l'état en DB, résolu au
 * boot dans `main.ts` avant `NestFactory.create`).
 */
export const EXTENSION_MODULES: Record<string, Type<any>> = {
  'prometheus-metrics': MetricsModule,
};
