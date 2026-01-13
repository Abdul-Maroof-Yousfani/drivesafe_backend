import {
  IsString,
  IsOptional,
  IsNumber,
  IsNotEmpty,
  IsBoolean,
  IsDateString,
  IsArray,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateWarrantySaleDto {
  @ApiProperty({ description: 'Customer ID' })
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @ApiProperty({ description: 'Warranty Package ID' })
  @IsString()
  @IsNotEmpty()
  warrantyPackageId: string;

  @ApiPropertyOptional({ description: 'Vehicle ID' })
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @ApiPropertyOptional({ description: 'Dealer ID' })
  @IsOptional()
  @IsString()
  dealerId?: string;

  @ApiPropertyOptional({ description: 'Coverage duration in months' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  duration?: number;

  @ApiPropertyOptional({ description: 'Sale price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: 'Excess amount' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  excess?: number;

  @ApiPropertyOptional({ description: 'Labour rate per hour' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  labourRatePerHour?: number;

  @ApiPropertyOptional({ description: 'Fixed claim limit' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedClaimLimit?: number;

  @ApiPropertyOptional({ description: 'Price for 12 months' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price12Months?: number;

  @ApiPropertyOptional({ description: 'Price for 24 months' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price24Months?: number;

  @ApiPropertyOptional({ description: 'Price for 36 months' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price36Months?: number;

  @ApiPropertyOptional({
    description: 'Payment method',
    default: 'cash',
  })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: 'Coverage start date' })
  @IsOptional()
  @IsDateString()
  coverageStartDate?: string;

  @ApiPropertyOptional({ description: 'Sales representative name' })
  @IsOptional()
  @IsString()
  salesRepresentativeName?: string;

  @ApiPropertyOptional({ description: 'Customer consent' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  customerConsent?: boolean;

  @ApiPropertyOptional({ description: 'Customer signature (file path/URL)' })
  @IsOptional()
  @IsString()
  customerSignature?: string;

  @ApiPropertyOptional({ description: 'Mileage at time of sale' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mileageAtSale?: number;

  @ApiPropertyOptional({
    description: 'Selected benefit IDs for this sale (snapshot)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includedBenefits?: string[];
}
