import { PartialType } from '@nestjs/swagger';
import { CreateWarrantyPackageDto } from './create-warranty-package.dto';
import { IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateWarrantyPackageDto extends PartialType(
  CreateWarrantyPackageDto,
) {
  @ApiPropertyOptional({
    description: 'Package status',
    enum: ['active', 'inactive'],
  })
  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
