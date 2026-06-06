import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class SubUserCreateDto {
  @ApiProperty({ example: 'My Proxy Account' })
  @IsString()
  label!: string;

  @ApiPropertyOptional({ example: 'u_specialuser' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ example: 'p_secretpassword' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ default: '*', example: '*' })
  @IsOptional()
  @IsString()
  allowed_ips?: string = '*';

  @ApiPropertyOptional({ default: 100, example: 100 })
  @IsOptional()
  @IsInt()
  threads_limit?: number = 100;

  @ApiPropertyOptional({ example: 10737418240 })
  @IsOptional()
  @IsInt()
  traffic_limit_bytes?: number;

  @ApiPropertyOptional({ example: 'US,FR' })
  @IsOptional()
  @IsString()
  country_filter?: string;

  @ApiPropertyOptional({ default: 1800, example: 1800 })
  @IsOptional()
  @IsInt()
  sticky_session_ttl?: number = 1800;

  /** Liste privée d'upstreams (1/ligne). Si renseignée, remplace le pool partagé. */
  @ApiPropertyOptional({ description: 'Liste privée d\'upstreams (1/ligne). Si renseignée, remplace le pool partagé.', example: 'socks5://1.1.1.1:1080' })
  @IsOptional()
  @IsString()
  custom_proxies?: string;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @IsInt()
  bandwidth_limit?: number;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsString()
  expires_at?: string;

  @ApiPropertyOptional({ example: 'residential,fr' })
  @IsOptional()
  @IsString()
  tags?: string;
}

export class SubUserUpdateDto {
  @ApiProperty({ example: 'subuser_id_here' })
  @IsString()
  id!: string;

  @ApiPropertyOptional({ example: 'Updated Proxy Account' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ example: '*' })
  @IsOptional()
  @IsString()
  allowed_ips?: string;

  @ApiPropertyOptional({ example: 150 })
  @IsOptional()
  @IsInt()
  threads_limit?: number;

  @ApiPropertyOptional({ example: 21474836480 })
  @IsOptional()
  @IsInt()
  traffic_limit_bytes?: number;

  @ApiPropertyOptional({ example: 'US' })
  @IsOptional()
  @IsString()
  country_filter?: string;

  @ApiPropertyOptional({ example: 'newpassword' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ example: 3600 })
  @IsOptional()
  @IsInt()
  sticky_session_ttl?: number;

  @ApiPropertyOptional({ example: 'socks5://1.1.1.1:1080' })
  @IsOptional()
  @IsString()
  custom_proxies?: string;

  @ApiPropertyOptional({ example: 1500 })
  @IsOptional()
  @IsInt()
  bandwidth_limit?: number;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsString()
  expires_at?: string;

  @ApiPropertyOptional({ example: 'residential,fr' })
  @IsOptional()
  @IsString()
  tags?: string;
}

export class SubUserBlockDto {
  @ApiProperty({ example: 'subuser_id_here' })
  @IsString()
  id!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  is_blocked!: boolean;
}

export class AllowedIpsAddDto {
  @ApiProperty({ example: 'subuser_id_here' })
  @IsString()
  id!: string;

  @ApiProperty({ type: [String], example: ['127.0.0.1', '1.1.1.1'] })
  @IsArray()
  @IsString({ each: true })
  ips!: string[];
}

export class StickySettingsDto {
  @ApiProperty({ example: 30 })
  @IsInt()
  @Min(0)
  ttl_minutes!: number;
}
