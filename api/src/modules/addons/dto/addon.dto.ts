import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUrl } from 'class-validator';

export class AddAddonDto {
  @ApiProperty({
    example: 'https://shop.example.com',
    description: 'URL de base de l\'addon. Le manifest sera lu depuis <baseUrl>/uhq-manifest.json',
  })
  @IsUrl({ require_tld: false })
  baseUrl!: string;
}

export class UpdateAddonDto {
  @ApiPropertyOptional({ description: 'Activer / désactiver l\'addon' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
