import {
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsDateString,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateWarrantySaleDto {
  @ApiPropertyOptional({ description: 'Sales representative name' })
  @IsOptional()
  @IsString()
  salesRepresentativeName?: string;

  @ApiPropertyOptional({ description: 'Warranty price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  warrantyPrice?: number;

  @ApiPropertyOptional({ description: 'Payment method' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: 'Coverage start date' })
  @IsOptional()
  @IsDateString()
  coverageStartDate?: string;

  @ApiPropertyOptional({ description: 'Coverage end date' })
  @IsOptional()
  @IsDateString()
  coverageEndDate?: string;

  @ApiPropertyOptional({
    description: 'Sale status',
    enum: ['active', 'inactive', 'cancelled', 'expired'],
  })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'cancelled', 'expired'])
  status?: 'active' | 'inactive' | 'cancelled' | 'expired';
}
