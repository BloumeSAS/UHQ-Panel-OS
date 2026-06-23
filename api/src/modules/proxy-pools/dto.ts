import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreatePoolDto {
  @ApiProperty({ example: 'Datacenter' })
  @IsString()
  @MaxLength(64)
  name!: string;

  @ApiPropertyOptional({ example: 'Proxies datacenter haute vitesse' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ example: '#6366f1', description: 'Couleur hexadécimale du badge' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: 9001, description: 'Port TCP dédié à cette pool, entre 9000 et 9999 (null = aucun).' })
  @IsOptional()
  @IsInt()
  @Min(9000)
  @Max(9999)
  port?: number;

  @ApiPropertyOptional({ example: 'mobile.example.com', description: 'Domaine affiché pour cette pool (null = utilise publicProxyHost).' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;
}

export class UpdatePoolDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string;

  @ApiPropertyOptional({ example: 9001, description: 'Port TCP dédié à cette pool, entre 9000 et 9999 (null = retire le port dédié).' })
  @IsOptional()
  @IsInt()
  @Min(9000)
  @Max(9999)
  port?: number | null;

  @ApiPropertyOptional({ example: 'mobile.example.com', description: 'Domaine affiché pour cette pool (null = retire le domaine dédié, utilise publicProxyHost).' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string | null;
}
