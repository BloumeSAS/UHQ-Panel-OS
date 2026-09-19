import { ArrayMinSize, IsArray, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BanIpDto {
  @ApiProperty({ type: [String], example: ['1.2.3.4', '5.6.7.8'], description: 'Une ou plusieurs IP à bannir' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ips!: string[];

  @ApiPropertyOptional({ example: 'Abus détecté — trafic anormal' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00Z', description: 'ISO date — absent = ban permanent' })
  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class UnbanManyDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids!: string[];
}
