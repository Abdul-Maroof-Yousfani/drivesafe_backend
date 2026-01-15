import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { WarrantyPackageService } from './services/warranty-package.service';
import {
  CreateWarrantyPackageDto,
  UpdateWarrantyPackageDto,
  AssignPackageToDealerDto,
} from './dto';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email: string;
    role: string;
    tenantId?: string;
  };
}

@ApiTags('Warranty Packages')
@ApiBearerAuth()
@Controller('warranty-packages')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WarrantyPackageController {
  constructor(
    private readonly warrantyPackageService: WarrantyPackageService,
  ) {}

  @Post()
  @Roles('super_admin', 'admin')
  @ApiOperation({ summary: 'Create a new warranty package' })
  async create(
    @Body() dto: CreateWarrantyPackageDto,
    @Req() req: RequestWithUser,
  ) {
    const pkg = await this.warrantyPackageService.create(dto, req.user.userId);
    return {
      status: true,
      message: 'Warranty package created successfully',
      data: pkg,
    };
  }

  @Get()
  @Roles('super_admin', 'admin', 'dealer')
  @ApiOperation({ summary: 'Get all warranty packages' })
  @ApiQuery({
    name: 'context',
    required: false,
    description: 'Filter by context',
  })
  @ApiQuery({
    name: 'includePresets',
    required: false,
    description: 'Include preset packages',
    type: Boolean,
  })
  async findAll(
    @Query('context') context: string | undefined,
    @Query('includePresets') includePresets: string | undefined,
    @Req() req: RequestWithUser,
  ) {
    const dealerId = req.user.role === 'dealer' ? req.user.tenantId : undefined;
    const includePresetsBool =
      includePresets === 'true'
        ? true
        : includePresets === 'false'
          ? false
          : undefined;
    const packages = await this.warrantyPackageService.findAll(
      context,
      dealerId,
      includePresetsBool,
    );
    return {
      status: true,
      data: packages,
    };
  }

  @Get(':id')
  @Roles('super_admin', 'admin', 'dealer')
  @ApiOperation({ summary: 'Get warranty package by ID' })
  async findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    const dealerId = req.user.role === 'dealer' ? req.user.tenantId : undefined;
    const pkg = await this.warrantyPackageService.findOne(id, dealerId);
    return {
      status: true,
      data: pkg,
    };
  }

  @Put(':id')
  @Roles('super_admin', 'admin')
  @ApiOperation({ summary: 'Update warranty package' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWarrantyPackageDto,
    @Req() req: RequestWithUser,
  ) {
    const pkg = await this.warrantyPackageService.update(
      id,
      dto,
      req.user.userId,
    );
    return {
      status: true,
      message: 'Warranty package updated successfully',
      data: pkg,
    };
  }

  @Delete(':id')
  @Roles('super_admin', 'admin')
  @ApiOperation({ summary: 'Delete warranty package' })
  async delete(@Param('id') id: string, @Req() req: RequestWithUser) {
    await this.warrantyPackageService.delete(id, req.user.userId);
    return {
      status: true,
      message:
        'Warranty package deleted successfully from master and tenant databases',
    };
  }

  @Post('assign-to-dealer')
  @Roles('super_admin', 'admin')
  @ApiOperation({ summary: 'Assign warranty package to dealer' })
  async assignToDealer(
    @Body() dto: AssignPackageToDealerDto,
    @Req() req: RequestWithUser,
  ) {
    const result = await this.warrantyPackageService.assignToDealer(
      dto,
      req.user.userId,
    );
    return {
      status: true,
      message: 'Warranty package assigned to Dealer Successfully',
      data: result,
    };
  }
}
