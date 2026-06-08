import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class SetupDto {
  @ApiProperty({ example: 'admin@bloume.fr' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ example: 'UHQ Panel OS by Bloume.fr' })
  @IsOptional()
  @IsString()
  siteName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  publicProxyHost?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  publicProxyPort?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  registrationEnabled?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() defaultLang?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() scrapeInterval?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() proxyCheckInterval?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() geoResolveInterval?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() checkerConcurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scraperProxy?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() groqApiKey?: string;
}

export class DatabaseSetupDto {
  @ApiProperty({ example: 'postgresql://user:pass@host:5432/uhqpanel' })
  @IsString()
  databaseUrl!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'admin@bloume.fr' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  captchaToken?: string;
}

export class RegisterDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  captchaToken?: string;
}

export class UpdateSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() siteName?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Transform(({ value }) => value === undefined || value === null ? value : (value === 'true' || value === true)) registrationEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultLang?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() publicProxyHost?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() publicProxyPort?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() proxyTimeout?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() proxyRacingTimeout?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() scrapeInterval?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() proxyCheckInterval?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() geoResolveInterval?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() checkerConcurrency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() scraperProxy?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() groqApiKey?: string;
  // SMTP
  @ApiPropertyOptional() @IsOptional() @IsString() smtpHost?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() smtpPort?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() smtpUser?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() smtpPass?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() smtpFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Transform(({ value }) => value === undefined || value === null ? value : (value === 'true' || value === true)) smtpSecure?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Transform(({ value }) => value === undefined || value === null ? value : (value === 'true' || value === true)) emailOnRegister?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Transform(({ value }) => value === undefined || value === null ? value : (value === 'true' || value === true)) emailOnLogin?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Transform(({ value }) => value === undefined || value === null ? value : (value === 'true' || value === true)) emailResetEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Transform(({ value }) => value === undefined || value === null ? value : (value === 'true' || value === true)) smtpReportsEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() smtpReportEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() smtpReportFrequency?: string;
  // Captcha
  @ApiPropertyOptional() @IsOptional() @IsString() captchaProvider?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() captchaSiteKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() captchaSecretKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() captchaCapEndpoint?: string;
  // Maintenance Mode
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Transform(({ value }) => value === undefined || value === null ? value : (value === 'true' || value === true)) maintenanceModeEnabled?: boolean;
  // Webhooks
  @ApiPropertyOptional() @IsOptional() @IsString() discordWebhookUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Transform(({ value }) => value === undefined || value === null ? value : (value === 'true' || value === true)) discordAlertsEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() slackWebhookUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Transform(({ value }) => value === undefined || value === null ? value : (value === 'true' || value === true)) slackAlertsEnabled?: boolean;
  // Backups
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Transform(({ value }) => value === undefined || value === null ? value : (value === 'true' || value === true)) backupDatabaseEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() backupIntervalCron?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() backupStorageType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() backupLocalPath?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() backupS3Endpoint?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() backupS3Bucket?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() backupS3AccessKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() backupS3SecretKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() backupS3Region?: string;
  // Invitations
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Transform(({ value }) => value === undefined || value === null ? value : (value === 'true' || value === true)) invitationsEnabled?: boolean;
}

export class CreatePanelUserDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty({ minLength: 8 }) @IsString() @MinLength(8) password!: string;
  @ApiPropertyOptional({ enum: ['ADMIN', 'USER'], default: 'USER' })
  @IsOptional()
  @IsIn(['ADMIN', 'USER'])
  role?: 'ADMIN' | 'USER';
}

export class UpdatePanelUserDto {
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional({ enum: ['ADMIN', 'USER'] })
  @IsOptional()
  @IsIn(['ADMIN', 'USER'])
  role?: 'ADMIN' | 'USER';
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ minLength: 8 }) @IsOptional() @IsString() @MinLength(8) password?: string;
  @ApiPropertyOptional() @IsOptional() expiresAt?: string | null;
}

export class AssignProxyDto {
  @ApiProperty()
  @IsString()
  proxyId!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'admin@bloume.fr' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  captchaToken?: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  captchaToken?: string;
}

export class SmtpTestDto {
  @ApiProperty({ example: 'test@bloume.fr' })
  @IsEmail()
  email!: string;
}

export class WebhookTestDto {
  @ApiProperty({ enum: ['discord', 'slack', 'bloumechat'], example: 'discord' })
  @IsIn(['discord', 'slack', 'bloumechat'])
  target!: string;
}

export class SetBlockedDto {
  @ApiProperty()
  @IsBoolean()
  is_blocked!: boolean;
}

export class BulkSubUsersDto {
  @ApiProperty({ enum: ['block', 'unblock', 'delete', 'reset-traffic'], example: 'block' })
  @IsIn(['block', 'unblock', 'delete', 'reset-traffic'])
  action!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class ImportProxiesDto {
  @ApiProperty({ description: 'Liste de proxies au format ip:port ou proto://ip:port, un par ligne.' })
  @IsString()
  text!: string;

  @ApiPropertyOptional({ enum: ['http', 'socks4', 'socks5'], description: 'Protocole forcé pour tous les proxies importés.' })
  @IsOptional()
  @IsString()
  protocol?: string;
}
