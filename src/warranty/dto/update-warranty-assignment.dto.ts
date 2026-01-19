import { IsNumber, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateWarrantyAssignmentDto {
  @ApiPropertyOptional({ description: 'Dealer cost for 12 months' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  dealerPrice12Months?: number;

  @ApiPropertyOptional({ description: 'Dealer cost for 24 months' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  dealerPrice24Months?: number;

  @ApiPropertyOptional({ description: 'Dealer cost for 36 months' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  dealerPrice36Months?: number;

  @ApiPropertyOptional({ description: 'Total assignment price override' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;
}
