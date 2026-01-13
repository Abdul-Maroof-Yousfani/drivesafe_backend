import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateWarrantyPlanLevelDto {
  @ApiPropertyOptional({ description: 'Name of the plan level' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Description of the plan level' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Default benefit IDs attached to this plan level',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  benefitIds?: string[];

  @ApiPropertyOptional({ description: 'Status of the plan level' })
  @IsOptional()
  @IsString()
  status?: string;
}


