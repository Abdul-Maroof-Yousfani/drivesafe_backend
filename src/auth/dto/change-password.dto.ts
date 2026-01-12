import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiPropertyOptional({ example: 'oldPassword123' })
  @IsString()
  @IsOptional()
  currentPassword?: string;

  @ApiProperty({ example: 'newPassword123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  isFirstLogin?: boolean;
}
