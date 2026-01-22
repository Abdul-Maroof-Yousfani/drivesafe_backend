import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsBoolean,
  IsDateString,
  IsInt,
} from 'class-validator';

export class CreateVehicleDto {
  @IsString()
  @IsNotEmpty()
  make: string;

  @IsString()
  @IsNotEmpty()
  model: string;

  @IsNumber()
  @IsNotEmpty()
  year: number;

  @IsString()
  @IsNotEmpty()
  vin: string;

  @IsString()
  @IsNotEmpty()
  registrationNumber: string;

  @IsNumber()
  @IsOptional()
  mileage?: number;

  @IsOptional()
  @IsEnum(['manual', 'automatic'])
  transmission?: 'manual' | 'automatic';

  // --- DVLA snapshot fields (optional) ---

  @IsString()
  @IsOptional()
  dvlaTaxStatus?: string;

  @IsDateString()
  @IsOptional()
  dvlaTaxDueDate?: string;

  @IsString()
  @IsOptional()
  dvlaMotStatus?: string;

  @IsDateString()
  @IsOptional()
  dvlaMotExpiryDate?: string;

  @IsInt()
  @IsOptional()
  dvlaYearOfManufacture?: number;

  @IsInt()
  @IsOptional()
  dvlaEngineCapacity?: number;

  @IsInt()
  @IsOptional()
  dvlaCo2Emissions?: number;

  @IsString()
  @IsOptional()
  dvlaFuelType?: string;

  @IsBoolean()
  @IsOptional()
  dvlaMarkedForExport?: boolean;

  @IsString()
  @IsOptional()
  dvlaColour?: string;

  @IsString()
  @IsOptional()
  dvlaTypeApproval?: string;

  @IsDateString()
  @IsOptional()
  dvlaDateOfLastV5CIssued?: string;

  @IsString()
  @IsOptional()
  dvlaWheelplan?: string;

  @IsString()
  @IsOptional()
  dvlaMonthOfFirstRegistration?: string;
}
