import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { InvoiceService } from './services/invoice.service';
import { GetInvoicesDto } from './dto/get-invoices.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';

interface RequestWithUser extends Request {
  user: {
    sub: string;
    email: string;
    role: string;
    dealerId?: string;
  };
}

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get()
  @Roles('super_admin', 'admin')
  @ApiOperation({ summary: 'Get all invoices (SA)' })
  async findAll(@Query() dto: GetInvoicesDto, @Req() req: RequestWithUser) {
    const result = await this.invoiceService.findAll(dto, req.user);
    return {
      status: true,
      data: result,
    };
  }

  @Get('dealer')
  @Roles('dealer')
  @ApiOperation({ summary: 'Get dealer invoices' })
  async getDealerInvoices(
    @Query() dto: GetInvoicesDto,
    @Req() req: RequestWithUser,
  ) {
    if (!req.user.dealerId) {
      throw new BadRequestException('Dealer context required');
    }
    const result = await this.invoiceService.findAll(dto, req.user);
    return {
      status: true,
      data: result,
    };
  }

  @Get(':id')
  @Roles('super_admin', 'admin', 'dealer', 'customer')
  @ApiOperation({ summary: 'Get invoice by ID' })
  async findOne(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
    @Query('dealerId') dealerId?: string,
  ) {
    const invoice = await this.invoiceService.findOne(id, req.user, dealerId);
    return {
      status: true,
      data: invoice,
    };
  }

  @Put(':id')
  @Roles('super_admin', 'admin', 'dealer', 'customer')
  @ApiOperation({ summary: 'Update invoice' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
    @Req() req: RequestWithUser,
  ) {
    // If SA passes dealerId in query instead of body, we might need to handle it.
    // Express code used req.query.dealerId as well.
    // Let's check query as override if body is missing it?
    // DTO handles body. For query param overrides, we might need to manually merge.
    // But Express code: `const { dealerId: queryDealerId } = req.query;`
    // pass it to service if DTO doesn't have it.

    // Actually our DTO `UpdateInvoiceDto` includes optional dealerId.
    // But client might send it in query params (legacy).
    // Let's populate DTO fro query if missing.
    if (!dto.dealerId && req.query.dealerId) {
      dto.dealerId = req.query.dealerId as string;
    }

    const updated = await this.invoiceService.update(id, dto, req.user);
    return {
      status: true,
      message: 'Invoice updated successfully',
      data: updated,
    };
  }

  @Get('statistics/dealer/:dealerId')
  @Roles('super_admin', 'admin')
  @ApiOperation({ summary: 'Get dealer invoice statistics' })
  async getDealerStatistics(
    @Param('dealerId') dealerId: string,
    @Req() req: RequestWithUser,
  ) {
    const stats = await this.invoiceService.getDealerStatistics(dealerId);
    return {
      status: true,
      data: stats,
    };
  }
}
