import { Module } from '@nestjs/common';
import { GeoResolver } from './geo/geo.service';
import { ScraperService } from './scraper.service';
import { ScraperSourcesController } from './controllers/scraper-sources.controller';

@Module({
  controllers: [ScraperSourcesController],
  providers: [GeoResolver, ScraperService],
  exports: [ScraperService, GeoResolver],
})
export class ScraperModule {}
