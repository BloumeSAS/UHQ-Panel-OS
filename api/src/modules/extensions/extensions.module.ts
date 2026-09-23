import { Module } from '@nestjs/common';
import { ExtensionsController } from './extensions.controller';
import { ExtensionsService } from './extensions.service';

/**
 * Module "toujours chargé" (contrairement aux extensions elles-mêmes) : le
 * panel doit pouvoir lister/activer/désactiver même si aucune extension
 * n'est actuellement active. Voir `extension-modules.ts` pour le
 * chargement conditionnel réel des extensions dans `app.module.ts`.
 * `AuditService` est `@Global()`, pas besoin de l'importer ici.
 */
@Module({
  controllers: [ExtensionsController],
  providers: [ExtensionsService],
  exports: [ExtensionsService],
})
export class ExtensionsModule {}
