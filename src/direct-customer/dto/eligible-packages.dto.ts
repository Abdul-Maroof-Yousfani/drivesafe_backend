import { IsString, IsNumber, IsOptional, IsEnum, Min, Max, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EligiblePackagesDto {
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
  @IsNumber()
  @Min(1900)
  @Max(2030)
  year: number;

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
