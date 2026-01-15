import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class CreateWarrantyItemDto {
  @ApiProperty({ description: 'Display label for the warranty item' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiPropertyOptional({
    description: 'Type of item',
    enum: ['benefit', 'feature'],
    default: 'benefit',
  })
  @IsOptional()
  @IsEnum(['benefit', 'feature'])
  type?: 'benefit' | 'feature';

  @ApiPropertyOptional({
    description: 'Detailed description of the benefit/feature',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
