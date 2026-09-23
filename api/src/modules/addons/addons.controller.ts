import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, JwtUser } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AddonsService } from './addons.service';
import { BundledAddonsService } from './bundled-addons.service';
import { AddAddonDto, UpdateAddonDto } from './dto/addon.dto';
import { loadOfficialAddons } from './official-addons-registry';

@ApiTags('panel-addons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/panel/addons')
export class AddonsController {
  constructor(
    private readonly service: AddonsService,
    private readonly bundled: BundledAddonsService,
  ) {}

  /**
   * Liste les addons actifs avec leur manifest (filtré selon le rôle).
   * Utilisé par le panel pour générer la nav et les routes iframe.
   */
  @Get()
  @ApiOperation({ summary: 'Liste les addons activés (manifest inclus)' })
  async list(@CurrentUser() user: JwtUser) {
    const data = await this.service.findAllEnabled(user.role === 'ADMIN');
    return { status: 'success', data };
  }

  /**
   * Liste complète (admin) : inclut les addons désactivés et les erreurs manifest.
   */
  @Get('all')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Liste tous les addons (admin)' })
  async listAll() {
    const data = await this.service.findAll();
    return { status: 'success', data };
  }

  /**
   * Preview d'un manifest sans sauvegarder — permet de vérifier avant ajout.
   * GET /api/panel/addons/preview?url=https://shop.example.com
   */
  @Get('preview')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Prévisualise le manifest d\'une URL (sans sauvegarder)' })
  async preview(@Query('url') url: string) {
    if (!url) return { status: 'error', message: 'url requis' };
    const data = await this.service.previewManifest(url);
    return { status: 'success', data };
  }

  /**
   * Ajoute un addon par son URL de base.
   * Télécharge automatiquement le manifest depuis <url>/uhq-manifest.json.
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Connecte un addon externe par son URL' })
  async add(@Body() dto: AddAddonDto) {
    const data = await this.service.addAddon(dto);
    return { status: 'success', data };
  }

  /**
   * Rafraîchit le manifest depuis l'URL de base de l'addon.
   */
  @Post(':id/refresh')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Re-télécharge le manifest de l\'addon' })
  async refresh(@Param('id') id: string) {
    const data = await this.service.refreshManifest(id);
    return { status: 'success', data };
  }

  /**
   * Confirme l'application d'une mise à jour :
   * enregistre la version courante du manifest comme "connue" et réinitialise hasUpdate.
   */
  @Post(':id/update')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Applique la mise à jour de l\'addon (acquitte la nouvelle version)' })
  async applyUpdate(@Param('id') id: string) {
    const data = await this.service.applyUpdate(id);
    return { status: 'success', data };
  }

  /**
   * Active ou désactive un addon.
   */
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Active / désactive un addon' })
  async update(@Param('id') id: string, @Body() dto: UpdateAddonDto) {
    const data = await this.service.update(id, dto);
    return { status: 'success', data };
  }

  /**
   * Supprime un addon (ne touche pas au service externe).
   */
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Déconnecte un addon' })
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return { status: 'success' };
  }

  /**
   * Registre des extensions officielles gratuites publiées par Bloume SAS —
   * lu depuis `addons/addons.json` (source unique, copiée dans l'image au
   * build). Ajouter un futur addon officiel = ajouter une entrée à ce
   * fichier, il apparaît ici automatiquement, sans toucher ce contrôleur.
   */
  @Get('registry')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Registre des extensions officielles gratuites' })
  registry() {
    return { status: 'success', data: loadOfficialAddons() };
  }

  /**
   * État des addons officiels "embarqués" (build présent dans CETTE image,
   * cf. addons/build-bundled.sh) : disponible / en cours d'exécution / port.
   */
  @Get('bundled')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'État des addons officiels embarqués (disponibilité + exécution)' })
  async bundledStatus() {
    return { status: 'success', data: await this.bundled.status() };
  }

  /**
   * Démarre (si besoin) un addon officiel embarqué et le connecte
   * automatiquement — pas de redémarrage du panel, juste le lancement d'un
   * processus enfant + un poll jusqu'à ce qu'il réponde.
   */
  @Post('bundled/:slug/activate')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Active un addon officiel embarqué' })
  async activateBundled(@Param('slug') slug: string) {
    const data = await this.bundled.activate(slug);
    return { status: 'success', data };
  }

  @Post('bundled/:slug/deactivate')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Désactive un addon officiel embarqué' })
  async deactivateBundled(@Param('slug') slug: string) {
    await this.bundled.deactivate(slug);
    return { status: 'success' };
  }
}
