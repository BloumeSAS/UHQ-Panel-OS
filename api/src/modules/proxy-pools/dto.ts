import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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

  @ApiPropertyOptional({ description: 'Les proxies de cette pool ne sont jamais marqués KO par le checker.' })
  @IsOptional()
  @IsBoolean()
  alwaysOnline?: boolean;

  @ApiPropertyOptional({ example: 'FR,DE,US,GB', description: 'Pays simulés (codes ISO 2 lettres, virgules) pour category-stats si alwaysOnline.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fakeCountries?: string;

  @ApiPropertyOptional({ example: 100000, description: "Borne min du nombre d'IP simulé (= max pour une valeur fixe)." })
  @IsOptional()
  @IsInt()
  @Min(0)
  fakeIpCountMin?: number;

  @ApiPropertyOptional({ example: 300000, description: "Borne max du nombre d'IP simulé (= min pour une valeur fixe)." })
  @IsOptional()
  @IsInt()
  @Min(0)
  fakeIpCountMax?: number;
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

  @ApiPropertyOptional({ description: 'Les proxies de cette pool ne sont jamais marqués KO par le checker.' })
  @IsOptional()
  @IsBoolean()
  alwaysOnline?: boolean;

  @ApiPropertyOptional({ example: 'FR,DE,US,GB', description: 'Pays simulés (codes ISO 2 lettres, virgules) pour category-stats si alwaysOnline (null = retire).' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fakeCountries?: string | null;

  @ApiPropertyOptional({ example: 100000, description: "Borne min du nombre d'IP simulé (= max pour une valeur fixe)." })
  @IsOptional()
  @IsInt()
  @Min(0)
  fakeIpCountMin?: number | null;

  @ApiPropertyOptional({ example: 300000, description: "Borne max du nombre d'IP simulé (= min pour une valeur fixe)." })
  @IsOptional()
  @IsInt()
  @Min(0)
  fakeIpCountMax?: number | null;
}
