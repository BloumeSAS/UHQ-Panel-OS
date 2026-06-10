import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateScraperSourceDto {
  @ApiProperty({ example: 'ProxyScrape HTTP' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'https://example.com/proxies.txt' })
  @IsUrl({ require_tld: false })
  url!: string;

  @ApiPropertyOptional({
    enum: ['auto', 'http', 'socks4', 'socks5'],
    default: 'http',
    description: "'auto' = détecte depuis le contenu (http://, socks5://…), fallback http.",
  })
  @IsOptional()
  @IsIn(['auto', 'http', 'socks4', 'socks5'])
  protocol?: string;

  @ApiPropertyOptional({ description: 'Regex à 2 groupes (ip, port). Vide = ip:port par défaut.' })
  @IsOptional()
  @IsString()
  pattern?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateScraperSourceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_tld: false }) url?: string;
  @ApiPropertyOptional({ enum: ['auto', 'http', 'socks4', 'socks5'] })
  @IsOptional()
  @IsIn(['auto', 'http', 'socks4', 'socks5'])
  protocol?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pattern?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}
