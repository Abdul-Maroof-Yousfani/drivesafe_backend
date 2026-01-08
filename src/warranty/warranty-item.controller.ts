import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { WarrantyItemService } from './services/warranty-item.service';

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
}
