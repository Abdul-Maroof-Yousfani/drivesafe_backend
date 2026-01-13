import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsEnum,
  Min,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateWarrantyPackageDto {
  @ApiProperty({ description: 'Package name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Package context',
    enum: ['drive_safe', 'dealer', 'direct_customer'],
  })
  @IsEnum(['drive_safe', 'dealer', 'direct_customer'])
  context: 'drive_safe' | 'dealer' | 'direct_customer';

  @ApiPropertyOptional({ description: 'Package description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Plan level' })
  @IsOptional()
  @IsString()
  planLevel?: string;

  @ApiPropertyOptional({ description: 'Eligibility criteria' })
  @IsOptional()
  @IsString()
  eligibility?: string;

  @ApiPropertyOptional({
    description: 'Mileage criteria comparator',
    enum: ['gt', 'lt'],
  })
  @IsOptional()
  @IsEnum(['gt', 'lt'])
  eligibilityMileageComparator?: 'gt' | 'lt';

  @ApiPropertyOptional({
    description: 'Mileage criteria value (miles)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  eligibilityMileageValue?: number;

  @ApiPropertyOptional({
    description: 'Maximum vehicle age in years',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  eligibilityVehicleAgeYearsMax?: number;

  @ApiPropertyOptional({
    description: 'Required transmission type',
    enum: ['manual', 'automatic'],
  })
  @IsOptional()
  @IsEnum(['manual', 'automatic'])
  eligibilityTransmission?: 'manual' | 'automatic';

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

  @ApiPropertyOptional({ description: 'Price for 12 months coverage' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price12Months?: number;

  @ApiPropertyOptional({ description: 'Price for 24 months coverage' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price24Months?: number;

  @ApiPropertyOptional({ description: 'Price for 36 months coverage' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price36Months?: number;

  @ApiPropertyOptional({ description: 'Duration value', default: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  durationValue?: number;

  @ApiPropertyOptional({
    description: 'Duration unit',
    enum: ['months', 'years'],
    default: 'months',
  })
  @IsOptional()
  @IsEnum(['months', 'years'])
  durationUnit?: 'months' | 'years';

  @ApiPropertyOptional({ description: 'Base price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({
    description: 'Array of warranty item IDs for key benefits',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keyBenefits?: string[];

  @ApiPropertyOptional({
    description: 'Array of warranty item IDs for included features',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includedFeatures?: string[];

  @ApiPropertyOptional({
    description: 'Whether this is a preset template',
    default: false,
  })
  @IsOptional()

  @ApiPropertyOptional({
    description: 'Preset type (silver, gold, platinum, etc.)',
    enum: ['silver', 'gold', 'platinum'],
  })
  @IsOptional()
  @IsEnum(['silver', 'gold', 'platinum'])
  presetType?: 'silver' | 'gold' | 'platinum';
}
