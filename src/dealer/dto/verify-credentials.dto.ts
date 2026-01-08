import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyCredentialsDto {
  @ApiProperty({ description: 'Super Admin password for verification' })
  @IsString()
  @IsNotEmpty()
  adminPassword: string;
}
