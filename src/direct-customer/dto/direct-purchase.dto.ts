import { IsString, IsEmail, IsNumber, IsOptional, IsEnum, Min, Max, ValidateNested, IsInt, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VehicleDetailsDto {
  @ApiProperty({ example: 'Toyota' })
  @IsString()
  @IsNotEmpty()
  make: string;

  @ApiProperty({ example: 'Camry' })
  @IsString()
  @IsNotEmpty()
  model: string;

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
