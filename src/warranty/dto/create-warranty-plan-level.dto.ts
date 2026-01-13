import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class CreateWarrantyPlanLevelDto {
  @ApiProperty({ description: 'Name of the plan level (e.g. Silver, Gold)' })
  @IsString()
  @IsNotEmpty()
  name: string;

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
}


