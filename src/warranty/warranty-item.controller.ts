import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { WarrantyItemService } from './services/warranty-item.service';
import { CreateWarrantyItemDto } from './dto/create-warranty-item.dto';

@ApiTags('Warranty Items')
@ApiBearerAuth()
@Controller('warranty-items')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WarrantyItemController {
  constructor(private readonly warrantyItemService: WarrantyItemService) {}

  @Get()
  @Roles('super_admin', 'admin', 'dealer')
  @ApiOperation({ summary: 'Get all warranty items (benefits/features)' })
  async findAll() {
    const items = await this.warrantyItemService.findAll();
    return {
      status: true,
      data: items,
    };
  }

  @Post()
  @Roles('super_admin', 'admin')
  @ApiOperation({ summary: 'Create a new warranty item (benefit/feature)' })
  async create(@Body() dto: CreateWarrantyItemDto) {
    const item = await this.warrantyItemService.create(dto);
    return {
      status: true,
      data: item,
    };
  }
}
