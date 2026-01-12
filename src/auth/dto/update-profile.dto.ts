import { IsOptional, IsString, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'First name' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Avatar URL' })
  @IsOptional()
  @IsString()
  avatar?: string;

  // Dealer-specific fields
  @ApiPropertyOptional({ description: 'Business legal name (dealer only)' })
  @IsOptional()
  @IsString()
  businessNameLegal?: string;

  @ApiPropertyOptional({ description: 'Business trading name (dealer only)' })
  @IsOptional()
  @IsString()
  businessNameTrading?: string;

  @ApiPropertyOptional({ description: 'Business address (dealer only)' })
  @IsOptional()
  @IsString()
  businessAddress?: string;

  @ApiPropertyOptional({ description: 'Contact person name (dealer only)' })
  @IsOptional()
  @IsString()
  contactPersonName?: string;

  @ApiPropertyOptional({
    description: 'Business registration number (dealer only)',
  })
  @IsOptional()
  @IsString()
  businessRegistrationNumber?: string;

  @ApiPropertyOptional({
    description: 'Bank details object (dealer only)',
    example: {
      bankName: 'Example Bank',
      accountNumber: '1234567890',
      routingNumber: '987654321',
    },
  })
  @IsOptional()
  @IsObject()
  bankDetails?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Authorized signatory object (dealer only)',
    example: {
      name: 'John Doe',
      title: 'CEO',
      signature: 'signature_url',
    },
  })
  @IsOptional()
  @IsObject()
  authorizedSignatory?: Record<string, any>;

  // Customer-specific fields
  @ApiPropertyOptional({ description: 'Address (customer only)' })
  @IsOptional()
  @IsString()
  address?: string;
}
