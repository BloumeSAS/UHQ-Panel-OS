import { Module } from '@nestjs/common';
import { AboutController } from './controllers/about.controller';
import { DocsController } from './controllers/docs.controller';

/** Page « À propos » : infos produit + vérification de mise à jour. */
@Module({
  controllers: [AboutController, DocsController],
})
export class AboutModule {}
