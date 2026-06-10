import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

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
}

export class UpdatePoolDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string;
}
