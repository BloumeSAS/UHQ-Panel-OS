import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BackupService } from './backup.service';
import { Response } from 'express';
import { RunBackupDto, TestS3Dto } from '../../common/dto/panel.dto';

@ApiTags('panel-backup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api/panel/backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  /**
   * Export all system settings as a JSON file.
   */
  @Get('settings/export')
  async exportSettings(@Res() res: Response) {
    const jsonContent = await this.backupService.exportSettings();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=settings-export.json');
    return res.send(jsonContent);
  }

  /**
   * Import system settings from a JSON payload.
   */
  @Post('settings/import')
  async importSettings(@Body() body: { settings?: Record<string, string>; settingsJson?: string }) {
    let rawJson = '';
    if (body.settings) {
      rawJson = JSON.stringify(body.settings);
    } else if (body.settingsJson) {
      rawJson = body.settingsJson;
    } else {
      return { status: 'error', message: 'No settings data provided.' };
    }

    try {
      await this.backupService.importSettings(rawJson);
      return { status: 'success', message: 'Settings imported successfully.' };
    } catch (err) {
      return { status: 'error', message: `Import failed: ${err.message}` };
    }
  }

  /**
   * List all database backups (local or S3 depending on storage configuration).
   */
  @Get('list')
  async listBackups() {
    try {
      const backups = await this.backupService.listBackups();
      return { status: 'success', data: backups };
    } catch (err) {
      return { status: 'error', message: `Failed to list backups: ${err.message}` };
    }
  }

  /**
   * Déclenche une sauvegarde manuelle immédiate SANS attendre sa fin (voir
   * BackupService.triggerManualBackup) — évite qu'une base volumineuse fasse
   * couper la requête par le reverse-proxy avant la fin de l'upload. Le panel
   * poll GET /backup/run-status pour connaître le résultat réel.
   * `storageType` (optionnel) force la destination pour CETTE sauvegarde
   * uniquement, sans changer le réglage global backupStorageType utilisé par
   * le cycle automatique.
   */
  @Post('run')
  runBackup(@Body() body: RunBackupDto) {
    const result = this.backupService.triggerManualBackup(body?.storageType);
    if (!result.started) return { status: 'error', message: result.message };
    return { status: 'success', message: 'Sauvegarde lancée en arrière-plan.' };
  }

  /** État de la dernière sauvegarde manuelle déclenchée — pour le polling du panel. */
  @Get('run-status')
  getRunStatus() {
    return { status: 'success', data: this.backupService.getManualRunStatus() };
  }

  /**
   * Teste des identifiants S3 (sans lancer de sauvegarde) — bouton "Tester la
   * connexion" du panel. Un champ vide/masqué retombe sur la valeur déjà
   * enregistrée en settings.
   */
  @Post('test-s3')
  async testS3(@Body() body: TestS3Dto) {
    return this.backupService.testS3Connection({
      endpoint: body.endpoint,
      region: body.region,
      bucket: body.bucket,
      accessKey: body.accessKey,
      secretKey: body.secretKey,
    });
  }

  /**
   * Restore the database state from a selected backup file.
   */
  @Post('restore')
  async restoreBackup(@Body() body: { filename: string }) {
    if (!body.filename) {
      return { status: 'error', message: 'Backup filename is required.' };
    }

    try {
      await this.backupService.restoreBackup(body.filename);
      return { status: 'success', message: `Database successfully restored from ${body.filename}` };
    } catch (err) {
      return { status: 'error', message: `Database restoration failed: ${err.message}` };
    }
  }

  /**
   * Delete a specific database backup.
   */
  @Delete(':filename')
  async deleteBackup(@Param('filename') filename: string) {
    if (!filename) {
      return { status: 'error', message: 'Filename is required.' };
    }

    try {
      await this.backupService.deleteBackup(filename);
      return { status: 'success', message: `Backup file ${filename} deleted successfully.` };
    } catch (err) {
      return { status: 'error', message: `Failed to delete backup: ${err.message}` };
    }
  }
}
