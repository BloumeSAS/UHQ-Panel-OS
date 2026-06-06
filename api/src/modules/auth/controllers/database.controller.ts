import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DatabaseConfigService } from '../../../database/database-config.service';
import { DatabaseSetupDto } from '../../../common/dto/panel.dto';
import { t } from '../../../common/utils/i18n';

/**
 * Configuration de la base de données au premier démarrage (public).
 * Verrouillé dès qu'une base est configurée.
 */
@ApiTags('panel-database')
@Controller('api/panel/setup')
export class PanelDatabaseController {
  constructor(private readonly dbConfig: DatabaseConfigService) {}

  @Get('db-status')
  status() {
    return { status: 'success', ...this.dbConfig.status() };
  }

  @Post('db')
  async configure(@Body() dto: DatabaseSetupDto) {
    if (this.dbConfig.status().configured) {
      throw new ForbiddenException(t('errors.dbAlreadyConfigured'));
    }
    try {
      await this.dbConfig.configureExternal(dto.databaseUrl);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      // Erreur de connexion → 400 explicite pour l'assistant.
      throw new HttpException(msg, HttpStatus.BAD_REQUEST);
    }
    return { status: 'success', restarting: true };
  }
}
