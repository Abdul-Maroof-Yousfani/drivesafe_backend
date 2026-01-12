import {
  IsString,
  IsOptional,
  IsNumber,
  IsNotEmpty,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AssignPackageToDealerDto {
  @ApiProperty({ description: 'Dealer ID' })
  @IsString()
  @IsNotEmpty()
  dealerId: string;

  @ApiProperty({ description: 'Warranty Package ID' })
  @IsString()
  @IsNotEmpty()
  warrantyPackageId: string;

  @ApiPropertyOptional({ description: 'Coverage duration in months' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  duration?: number;

  @ApiPropertyOptional({ description: 'Excess amount override' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  excess?: number;

  @ApiPropertyOptional({ description: 'Labour rate per hour override' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  labourRatePerHour?: number;

  @ApiPropertyOptional({ description: 'Fixed claim limit override' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedClaimLimit?: number;

  @ApiPropertyOptional({
    description: 'Dealer cost for 12 months (what dealer pays to SA)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dealerPrice12Months?: number;

  @ApiPropertyOptional({
    description: 'Dealer cost for 24 months (what dealer pays to SA)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dealerPrice24Months?: number;

  @ApiPropertyOptional({
    description: 'Dealer cost for 36 months (what dealer pays to SA)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dealerPrice36Months?: number;
}
