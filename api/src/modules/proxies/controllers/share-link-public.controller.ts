import { Controller, Get, HttpException, HttpStatus, NotFoundException, Param } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../../database/prisma.service';
import { SettingsService } from '../../../config/settings.service';
import { resolveConnectionEndpoint } from '../../../common/utils/connection-endpoint';
import { t } from '../../../common/utils/i18n';

/**
 * Résolution PUBLIQUE (aucun guard, aucun JWT) d'un lien de partage — donne les
 * identifiants de connexion d'un compte proxy à qui possède le token. Le token
 * (40 car. aléatoires) fait office de secret ; expiration/révocation vérifiées
 * à chaque accès. Ne JAMAIS ajouter d'autre info sensible ici (règle CLAUDE.md
 * #3 : pas de fuite de secrets au-delà de ce qui est explicitement partagé).
 */
@ApiTags('public-share-link')
@Controller('api/panel/share')
export class ShareLinkPublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  @ApiParam({ name: 'token', description: 'Token du lien de partage' })
  @Get(':token')
  async resolve(@Param('token') token: string) {
    const link = await this.prisma.shareLink.findUnique({ where: { token } });
    if (!link) throw new NotFoundException(t('errors.proxyNotFound'));
    if (link.revoked) throw new HttpException('Ce lien de partage a été révoqué.', HttpStatus.GONE);
    if (link.expiresAt && link.expiresAt < new Date()) throw new HttpException('Ce lien de partage a expiré.', HttpStatus.GONE);

    const user = await this.prisma.userProxy.findUnique({ where: { id: link.userProxyId } });
    if (!user) throw new NotFoundException(t('errors.proxyNotFound'));

    const { host, port } = await resolveConnectionEndpoint(this.prisma, this.settings, user);
    return {
      status: 'success',
      data: {
        label: user.name,
        username: user.username,
        password: user.password,
        host,
        port,
        expiresAt: link.expiresAt,
      },
    };
  }
}
