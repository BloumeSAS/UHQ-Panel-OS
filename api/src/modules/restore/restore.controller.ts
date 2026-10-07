import { Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RestoreService } from './restore.service';

/**
 * Restauration d'une sauvegarde depuis l'assistant d'installation (public,
 * mais refusé dès que l'installation est terminée — cf. RestoreService.assertAllowed).
 * Upload en morceaux (PUT brut) : compatible avec les limites de taille des proxies/CDN.
 */
@ApiTags('panel-restore')
@Controller('api/panel/setup/restore')
export class RestoreController {
  constructor(private readonly restore: RestoreService) {}

  @Get('status')
  status() {
    return { status: 'success', ...this.restore.status() };
  }

  @Post('begin')
  async begin(@Body() body: { filename?: string; size?: number }) {
    return { status: 'success', ...(await this.restore.begin(String(body?.filename ?? ''), Number(body?.size))) };
  }

  @Post('chunk/:id')
  async chunk(@Param('id') id: string, @Query('offset') offset: string, @Req() req: any) {
    return { status: 'success', ...(await this.restore.appendChunk(id, Number(offset), req)) };
  }

  @Post('finish/:id')
  async finish(@Param('id') id: string) {
    return { status: 'success', ...(await this.restore.finish(id)) };
  }

  @Delete(':id')
  cancel(@Param('id') id: string) {
    return { status: 'success', ...this.restore.cancel(id) };
  }
}
