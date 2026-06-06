import { Module } from '@nestjs/common';
import { PanelUserController } from './controllers/users.controller';

/** Gestion des utilisateurs du panel + assignation de comptes proxy (admin). */
@Module({
  controllers: [PanelUserController],
})
export class UsersModule {}
