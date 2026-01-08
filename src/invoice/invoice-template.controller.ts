import {
  Controller,
  Get,
  Post,
  Body,
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
import { InvoiceTemplateService } from './services/invoice-template.service';
import { UpsertInvoiceTemplateDto } from './dto/upsert-invoice-template.dto';

interface RequestWithUser extends Request {
  user: {
    sub: string;
    email: string;
    role: string;
    dealerId?: string;
  };
}

@ApiTags('Invoice Settings')
@ApiBearerAuth()
@Controller('settings') // Matches Express route /settings (assuming mounted at root or context aware)
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoiceTemplateController {
  constructor(
    private readonly invoiceTemplateService: InvoiceTemplateService,
  ) {}

  @Get()
  @Roles('super_admin', 'admin', 'dealer', 'customer')
  @ApiOperation({ summary: 'Get invoice template' })
  @ApiQuery({ name: 'dealerId', required: false, description: 'Dealer ID' })
  @ApiQuery({
    name: 'scope',
    required: false,
    description: 'Scope (e.g. master)',
  })
  async getTemplate(
    @Req() req: RequestWithUser,
    @Query('dealerId') dealerId?: string,
    @Query('scope') scope?: string,
  ) {
    const template = await this.invoiceTemplateService.getTemplate(
      req.user,
      dealerId,
      scope,
    );
    return {
      status: true,
      data: template,
    };
  }

  @Post()
  @Roles('super_admin', 'admin', 'dealer')
  @ApiOperation({ summary: 'Create or update invoice template' })
  async upsertTemplate(
    @Body() dto: UpsertInvoiceTemplateDto,
    @Req() req: RequestWithUser,
  ) {
    const template = await this.invoiceTemplateService.upsertTemplate(
      dto,
      req.user,
    );
    return {
      status: true,
      message: 'Invoice settings saved successfully',
      data: template,
    };
  }
}
