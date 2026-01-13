import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { WarrantyPlanLevelService } from './services/warranty-plan-level.service';
import { CreateWarrantyPlanLevelDto } from './dto/create-warranty-plan-level.dto';
import { UpdateWarrantyPlanLevelDto } from './dto/update-warranty-plan-level.dto';

@ApiTags('Warranty Plan Levels')
@ApiBearerAuth()
@Controller('warranty-plan-levels')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WarrantyPlanLevelController {
  constructor(
    private readonly planLevelService: WarrantyPlanLevelService,
  ) {}

  @Get()
  @Roles('super_admin', 'admin')
  @ApiOperation({
    summary: 'Get all warranty plan levels with default benefits',
  })
  async findAll() {
    const data = await this.planLevelService.findAll();
    return { status: true, data };
  }

  @Get(':id')
  @Roles('super_admin', 'admin')
  @ApiOperation({
    summary: 'Get a single warranty plan level by ID',
  })
  async findOne(@Param('id') id: string) {
    const data = await this.planLevelService.findOne(id);
    return { status: true, data };
  }

  @Post()
  @Roles('super_admin', 'admin')
  @ApiOperation({
    summary: 'Create a new warranty plan level',
  })
  async create(@Body() dto: CreateWarrantyPlanLevelDto) {
    const data = await this.planLevelService.create(dto);
    return {
      status: true,
      message: 'Plan level created successfully',
      data,
    };
  }

  @Put(':id')
  @Roles('super_admin', 'admin')
  @ApiOperation({
    summary: 'Update an existing warranty plan level',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWarrantyPlanLevelDto,
  ) {
    const data = await this.planLevelService.update(id, dto);
    return {
      status: true,
      message: 'Plan level updated successfully',
      data,
    };
  }

  @Delete(':id')
  @Roles('super_admin', 'admin')
  @ApiOperation({
    summary: 'Soft delete a warranty plan level',
  })
  async remove(@Param('id') id: string) {
    await this.planLevelService.remove(id);
    return {
      status: true,
      message: 'Plan level deleted successfully',
    };
  }
}


