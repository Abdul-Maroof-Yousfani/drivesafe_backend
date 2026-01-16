import { IsOptional, IsString, IsNumber, IsEnum } from 'class-validator';

export class UpdateVehicleDto {
  @IsString()
  @IsOptional()
  make?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsNumber()
  @IsOptional()
  year?: number;

  @IsString()
  @IsOptional()
  vin?: string;

  @IsString()
  @IsOptional()
  registrationNumber?: string;

  @IsNumber()
  @IsOptional()
  mileage?: number;

  @IsOptional()
  @IsEnum(['manual', 'automatic'])
  transmission?: 'manual' | 'automatic';
}
