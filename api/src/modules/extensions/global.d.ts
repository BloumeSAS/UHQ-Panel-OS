// Ensemble des clés d'extensions réellement chargées dans le graphe NestJS de
// CE process (résolu une fois au boot, avant NestFactory.create — cf.
// main.ts). Un simple global plutôt qu'un provider DI : on en a besoin AVANT
// que Nest existe, et en lecture depuis ExtensionsService ensuite.
export {};

declare global {
  // eslint-disable-next-line no-var
  var __UHQ_ACTIVE_EXTENSIONS__: Set<string> | undefined;
}
