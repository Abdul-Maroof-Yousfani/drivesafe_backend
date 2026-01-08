import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsBoolean,
  IsDateString,
  Length,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDealerDto {
  @ApiProperty({ example: 'Auto World Pvt Ltd' })
  @IsString()
  @IsNotEmpty()
  legalName: string;

  @ApiPropertyOptional({ example: 'Auto World' })
  @IsString()
  @IsOptional()
  tradingName?: string;

  @ApiProperty({ example: '123 Main St, City' })
  @IsString()
  @IsNotEmpty()
  businessAddress: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  contactPersonName: string;

  @ApiProperty({ example: '+1234567890' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'dealer@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ example: 'DL-12345' })
  @IsString()
  @IsOptional()
  dealerLicenseNumber?: string;

  @ApiPropertyOptional({ example: 'BRN-67890' })
  @IsString()
  @IsOptional()
  businessRegistrationNumber?: string;

  @ApiPropertyOptional({ example: { bankName: 'Bank', account: '123' } })
  @IsOptional()
  bankDetails?: any;

  @ApiPropertyOptional({
    example: { name: 'Signatory', designation: 'Manager' },
  })
  @IsOptional()
  authorizedSignatory?: any;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  dealerAgreementSigned?: boolean;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  onboardingDate?: string;

  @ApiProperty({ example: 'Password123!', minLength: 8 })
  @IsString()
  @IsNotEmpty()
  @Length(8, 50)
  password: string;
}
