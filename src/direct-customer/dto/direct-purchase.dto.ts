import {
  IsString,
  IsEmail,
  IsNumber,
  IsOptional,
  IsEnum,
  Min,
  Max,
  ValidateNested,
  IsInt,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VehicleDetailsDto {
  @ApiProperty({ example: 'Toyota' })
  @IsString()
  @IsNotEmpty()
  make: string;

  @ApiPropertyOptional({ example: 'Camry' })
  @IsString()
  @IsOptional()
  model?: string;

  @ApiProperty({ example: 2023 })
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2030)
  year: number;

  @ApiPropertyOptional({ example: '1HGBH41JXMN109186' })
  @IsString()
  @IsOptional()
  vin?: string;

  @ApiPropertyOptional({ example: 'ABC-1234' })
  @IsString()
  @IsOptional()
  registrationNumber?: string;

  @ApiProperty({ example: 50000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mileage: number;

  @ApiPropertyOptional({ enum: ['manual', 'automatic'] })
  @IsEnum(['manual', 'automatic'])
  @IsOptional()
  transmission?: 'manual' | 'automatic';

  // --- DVLA snapshot fields (optional) ---

  @ApiPropertyOptional({ example: 'Untaxed' })
  @IsString()
  @IsOptional()
  dvlaTaxStatus?: string;

  @ApiPropertyOptional({ example: '2025-04-29' })
  @IsString()
  @IsOptional()
  dvlaTaxDueDate?: string;

  @ApiPropertyOptional({ example: 'Valid' })
  @IsString()
  @IsOptional()
  dvlaMotStatus?: string;

  @ApiPropertyOptional({ example: '2026-08-27' })
  @IsString()
  @IsOptional()
  dvlaMotExpiryDate?: string;

  @ApiPropertyOptional({ example: 2016 })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  dvlaYearOfManufacture?: number;

  @ApiPropertyOptional({ example: 1200 })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  dvlaEngineCapacity?: number;

  @ApiPropertyOptional({ example: 100 })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  dvlaCo2Emissions?: number;

  @ApiPropertyOptional({ example: 'PETROL' })
  @IsString()
  @IsOptional()
  dvlaFuelType?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  dvlaMarkedForExport?: boolean;

  @ApiPropertyOptional({ example: 'BLACK' })
  @IsString()
  @IsOptional()
  dvlaColour?: string;

  @ApiPropertyOptional({ example: 'M1' })
  @IsString()
  @IsOptional()
  dvlaTypeApproval?: string;

  @ApiPropertyOptional({ example: '2025-09-15' })
  @IsString()
  @IsOptional()
  dvlaDateOfLastV5CIssued?: string;

  @ApiPropertyOptional({ example: '2 AXLE RIGID BODY' })
  @IsString()
  @IsOptional()
  dvlaWheelplan?: string;

  @ApiPropertyOptional({ example: '2016-10' })
  @IsString()
  @IsOptional()
  dvlaMonthOfFirstRegistration?: string;
}

export class CustomerDetailsDto {
  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+1234567890' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: '123 Main St, City, State 12345' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional({ example: 'New York' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ example: 'NY' })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiPropertyOptional({ example: '10001' })
  @IsString()
  @IsOptional()
  zipCode?: string;
}

export class DirectPurchaseDto {
  @ApiProperty({ type: VehicleDetailsDto })
  @ValidateNested()
  @Type(() => VehicleDetailsDto)
  vehicle: VehicleDetailsDto;

  @ApiProperty({ type: CustomerDetailsDto })
  @ValidateNested()
  @Type(() => CustomerDetailsDto)
  customer: CustomerDetailsDto;

  @ApiProperty({ example: 'pkg-uuid-here' })
  @IsString()
  @IsNotEmpty()
  warrantyPackageId: string;

  @ApiProperty({ example: 12, enum: [12, 24, 36] })
  @IsNumber()
  @IsEnum([12, 24, 36])
  duration: 12 | 24 | 36;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  termsAccepted?: boolean;
}
