import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { ProxyEngineModule } from '../proxy-engine/proxy-engine.module';
import { CheckerModule } from '../checker/checker.module';
import { ScraperModule } from '../scraper/scraper.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

/** Agrégats de statistiques (addon « Analyse » + page « Mon activité »). Lecture seule. */
@Module({
  imports: [PrismaModule, ProxyEngineModule, CheckerModule, ScraperModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
