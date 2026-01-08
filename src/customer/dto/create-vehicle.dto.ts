import { IsNotEmpty, IsOptional, IsString, IsNumber } from 'class-validator';

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
}
