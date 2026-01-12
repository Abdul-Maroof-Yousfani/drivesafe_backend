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

  @IsString()
  @IsOptional()
  mileage?: string;

  @IsOptional()
  @IsEnum(['manual', 'automatic'])
  transmission?: 'manual' | 'automatic';
}
