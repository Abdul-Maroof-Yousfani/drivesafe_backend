import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { DirectCustomerService } from './direct-customer.service';
import { DirectPurchaseDto, EligiblePackagesDto } from './dto';

@ApiTags('Direct Customer (Public)')
@Controller('direct-customer')
export class DirectCustomerController {
  constructor(private readonly directCustomerService: DirectCustomerService) {}

  @Post('packages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get eligible warranty packages based on vehicle details (Public)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of eligible warranty packages',
  })
  async getPackages(@Body() dto: EligiblePackagesDto) {
    const data = await this.directCustomerService.getAvailablePackages(dto);
    return { status: true, data };
  }

  @Post('purchase')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Complete a direct customer warranty purchase (Public)',
  })
  @ApiResponse({
    status: 201,
    description: 'Purchase completed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data',
  })
  @ApiResponse({
    status: 409,
    description: 'Email already exists',
  })
  async completePurchase(@Body() dto: DirectPurchaseDto) {
    const result = await this.directCustomerService.completePurchase(dto);
    return {
      status: true,
      message: 'Warranty purchase completed successfully',
      data: {
        customerId: result.customer.id,
        customerEmail: result.customer.email,
        vehicleId: result.vehicle.id,
        warrantySaleId: result.warrantySale.id,
        policyNumber: result.warrantySale.policyNumber,
        invoiceId: result.invoice.id,
        invoiceNumber: result.invoice.invoiceNumber,
        temporaryPassword: result.temporaryPassword,
        coverageStartDate: result.warrantySale.coverageStartDate,
        coverageEndDate: result.warrantySale.coverageEndDate,
        totalAmount: result.warrantySale.warrantyPrice,
      },
    };
  }
}
