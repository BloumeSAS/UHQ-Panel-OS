import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { SubUserCreateDto, PanelSubUserUpdateDto } from '../legacy-api/dto';

/**
 * Variantes panel-only de SubUserCreateDto/PanelSubUserUpdateDto, avec le
 * champ `port` en plus. Ne PAS ajouter `port` directement dans
 * `legacy-api/dto.ts` : ces DTOs sont partagés avec l'API legacy
 * (/api/v1/sub-user/*), qui ne doit jamais pouvoir lire/écrire ce champ.
 */
export class PanelSubUserCreateDto extends SubUserCreateDto {
  @ApiPropertyOptional({ example: 9101, description: 'Port TCP dédié à ce compte, entre 9000 et 9100 (null = aucun).' })
  @IsOptional()
  @IsInt()
  @Min(9000)
  @Max(9100)
  port?: number;
}

export class PanelSubUserUpdatePortDto extends PanelSubUserUpdateDto {
  @ApiPropertyOptional({ example: 9101, description: 'Port TCP dédié à ce compte, entre 9000 et 9100 (null = retire le port dédié).' })
  @IsOptional()
  @IsInt()
  @Min(9000)
  @Max(9100)
  port?: number | null;
}
