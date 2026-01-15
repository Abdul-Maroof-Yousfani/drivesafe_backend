import { PartialType } from '@nestjs/swagger';
import { CreateWarrantyItemDto } from './create-warranty-item.dto';

export class UpdateWarrantyItemDto extends PartialType(CreateWarrantyItemDto) {}
