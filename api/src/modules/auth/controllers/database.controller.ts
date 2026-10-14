import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DatabaseConfigService } from '../../../database/database-config.service';
import { DatabaseSetupDto } from '../../../common/dto/panel.dto';
import { t } from '../../../common/utils/i18n';
import { SetupTokenGuard, setupTokenRequired } from '../../../common/guards/setup-token.guard';

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
    const st = this.dbConfig.status();
    return { status: 'success', ...st, setupTokenRequired: setupTokenRequired() };
  }

  /** Sonde la base embarquée Docker (service `db`). Public, pas de garde. */
  @Get('db-probe')
  async probe() {
    const url = await this.dbConfig.probeBundled();
    return { status: 'success', available: !!url, url };
  }

  @UseGuards(SetupTokenGuard)
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
