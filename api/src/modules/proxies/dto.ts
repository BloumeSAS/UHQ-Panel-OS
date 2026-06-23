import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { SubUserCreateDto, PanelSubUserUpdateDto } from '../legacy-api/dto';

/**
 * Variantes panel-only de SubUserCreateDto/PanelSubUserUpdateDto, avec les
 * champs `port`/`domain` en plus. Ne PAS les ajouter directement dans
 * `legacy-api/dto.ts` : ces DTOs sont partagés avec l'API legacy
 * (/api/v1/sub-user/*), qui ne doit jamais pouvoir lire/écrire ces champs.
 */
export class PanelSubUserCreateDto extends SubUserCreateDto {
  @ApiPropertyOptional({ example: 9101, description: 'Port TCP dédié à ce compte, entre 9000 et 9999 (null = aucun).' })
  @IsOptional()
  @IsInt()
  @Min(9000)
  @Max(9999)
  port?: number;

  @ApiPropertyOptional({ example: 'client1.example.com', description: 'Domaine affiché pour ce compte (null = utilise celui de sa pool, sinon publicProxyHost).' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;
}

export class PanelSubUserUpdatePortDto extends PanelSubUserUpdateDto {
  @ApiPropertyOptional({ example: 9101, description: 'Port TCP dédié à ce compte, entre 9000 et 9999 (null = retire le port dédié).' })
  @IsOptional()
  @IsInt()
  @Min(9000)
  @Max(9999)
  port?: number | null;

  @ApiPropertyOptional({ example: 'client1.example.com', description: 'Domaine affiché pour ce compte (null = retire le domaine dédié).' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string | null;
}
