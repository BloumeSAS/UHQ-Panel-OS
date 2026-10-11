import { Module } from '@nestjs/common';
import { BackupModule } from '../backup/backup.module';
import { RestoreController } from './restore.controller';
import { RestoreService } from './restore.service';

/** Restauration d'une sauvegarde PostgreSQL complète depuis /setup. */
@Module({
  imports: [BackupModule],
  controllers: [RestoreController],
  providers: [RestoreService],
  exports: [RestoreService],
})
export class RestoreModule {}
