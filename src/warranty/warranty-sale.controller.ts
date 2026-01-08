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
  BadRequestException,
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
import { WarrantySaleService } from './services/warranty-sale.service';
import { CreateWarrantySaleDto, UpdateWarrantySaleDto } from './dto';

interface RequestWithUser extends Request {
  user: {
    sub: string;
    email: string;
    role: string;
    dealerId?: string;
  };
}

@ApiTags('Warranty Sales')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class WarrantySaleController {
  constructor(private readonly warrantySaleService: WarrantySaleService) {}

  /**
   * SA: Create warranty sale in master DB
   */
  @Post('warranty-sales')
  @Roles('super_admin', 'admin')
  @ApiOperation({ summary: 'Create warranty sale (Super Admin)' })
  async createMasterSale(
    @Body() dto: CreateWarrantySaleDto,
    @Req() req: RequestWithUser,
  ) {
    const sale = await this.warrantySaleService.createMasterSale(
      dto,
      req.user.sub,
    );
    return {
      status: true,
      message: 'Warranty sale created successfully',
      data: sale,
    };
  }

  /**
   * SA: List warranty sales
   */
  @Get('warranty-sales')
  @Roles('super_admin', 'admin')
  @ApiOperation({ summary: 'List warranty sales (Super Admin)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'dealerId', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async findAll(
    @Query('status') status?: string,
    @Query('dealerId') dealerId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Req() req?: RequestWithUser,
  ) {
    const sales = await this.warrantySaleService.findAll({
      status,
      dealerId,
      startDate,
      endDate,
      role: req?.user?.role,
      userId: req?.user?.sub,
    });
    return {
      status: true,
      data: sales,
    };
  }

  /**
   * Get warranty sale by ID
   */
  @Get('warranty-sales/:id')
  @Roles('super_admin', 'admin', 'dealer', 'customer')
  @ApiOperation({ summary: 'Get warranty sale by ID' })
  async findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    const sale = await this.warrantySaleService.findOne(id, {
      role: req.user.role,
      userId: req.user.sub,
      email: req.user.email,
      dealerId: req.user.dealerId,
    });
    return {
      status: true,
      data: sale,
    };
  }

  /**
   * Update warranty sale
   */
  @Put('warranty-sales/:id')
  @Roles('super_admin', 'admin')
  @ApiOperation({ summary: 'Update warranty sale' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWarrantySaleDto,
    @Req() req: RequestWithUser,
  ) {
    const sale = await this.warrantySaleService.update(id, dto, {
      role: req.user.role,
      userId: req.user.sub,
    });
    return {
      status: true,
      message: 'Warranty sale updated successfully',
      data: sale,
    };
  }

  /**
   * Delete warranty sale
   */
  @Delete('warranty-sales/:id')
  @Roles('super_admin', 'admin')
  @ApiOperation({ summary: 'Delete warranty sale' })
  async delete(@Param('id') id: string, @Req() req: RequestWithUser) {
    await this.warrantySaleService.delete(id, {
      role: req.user.role,
      userId: req.user.sub,
    });
    return {
      status: true,
      message: 'Warranty sale deleted successfully from all databases',
    };
  }

  /**
   * Dealer: Get warranty sales
   */
  @Get('dealer/warranty-sales')
  @Roles('dealer')
  @ApiOperation({ summary: 'Get dealer warranty sales' })
  async getDealerSales(@Req() req: RequestWithUser) {
    if (!req.user.dealerId) {
      throw new BadRequestException('Dealer context required');
    }

    const sales = await this.warrantySaleService.getDealerSales(
      req.user.dealerId,
    );
    return {
      status: true,
      data: sales,
    };
  }

  /**
   * Dealer: Create warranty sale
   */
  @Post('dealer/warranty-sales')
  @Roles('dealer')
  @ApiOperation({ summary: 'Create dealer warranty sale' })
  async createDealerSale(
    @Body() dto: CreateWarrantySaleDto,
    @Req() req: RequestWithUser,
  ) {
    if (!req.user.dealerId) {
      throw new BadRequestException('Dealer context required');
    }

    const sale = await this.warrantySaleService.createDealerSale(
      dto,
      req.user.sub,
      req.user.dealerId,
    );
    return {
      status: true,
      message: 'Warranty sale created successfully',
      data: sale,
    };
  }

  /**
   * Customer: Get my warranties
   */
  @Get('customer/my-warranties')
  @Roles('customer')
  @ApiOperation({ summary: 'Get customer warranties' })
  async getMyWarranties(@Req() req: RequestWithUser) {
    const sales = await this.warrantySaleService.getCustomerWarranties(
      req.user.email,
    );
    return {
      status: true,
      data: sales,
    };
  }
}
