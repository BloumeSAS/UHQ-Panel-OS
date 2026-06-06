import { IsString, IsOptional, MinLength, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TotpVerifyDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  token!: string;
}

export class TotpEnableDto {
  @ApiProperty({ example: '123456', description: 'Code TOTP à vérifier avant activation' })
  @IsString()
  token!: string;
}

export class CreateSessionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ip?: string;
}

export class CreateApiKeyDto {
  @ApiProperty({ example: 'My CI key' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: ['read:proxies', 'read:stats'], type: [String] })
  @IsOptional()
  scopes?: string[];

  @ApiPropertyOptional({ example: '2025-12-31T00:00:00Z' })
  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class UpdateApiKeyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  scopes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class CreateInvitationDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsString()
  email!: string;

  @ApiPropertyOptional({ enum: ['ADMIN', 'USER'], default: 'USER' })
  @IsOptional()
  @IsString()
  role?: string;
}

export class AcceptInvitationDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class BulkUsersDto {
  @ApiProperty({ enum: ['activate', 'deactivate', 'delete'], example: 'deactivate' })
  @IsString()
  action!: string;

  @ApiProperty({ type: [String] })
  ids!: string[];
}
