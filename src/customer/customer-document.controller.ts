import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { CustomerDocumentService } from './services/customer-document.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('customer-documents')
@Controller('customer-documents')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CustomerDocumentController {
  constructor(private readonly documentService: CustomerDocumentService) {}

  @Post(':customerId')
  @ApiOperation({ summary: 'Create a new document for a customer' })
  async create(
    @Param('customerId') customerId: string,
    @Body() payload: { name: string; description?: string; fileId: string },
    @Request() req,
  ) {
    return this.documentService.create(customerId, payload, req.user);
  }

  @Get('all')
  @ApiOperation({ summary: 'Get all documents (Super Admin only)' })
  async getAll(@Request() req) {
    // Basic check: only admin/super-admin should use this
    const allowedRoles = ['super-admin', 'super_admin', 'admin'];
    if (!allowedRoles.includes(req.user.role)) {
      throw new UnauthorizedException(
        'Insufficient permissions to view all documents',
      );
    }
    return this.documentService.getAllDocuments();
  }

  @Get('mine')
  @ApiOperation({ summary: 'Get all documents for current dealer' })
  async findMine(@Request() req) {
    if (req.user.role !== 'dealer' || !req.user.dealerId) {
      throw new UnauthorizedException('Only dealers can use this endpoint');
    }
    return this.documentService.findAllForDealer(req.user.dealerId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get documents for the current logged-in customer' })
  async findMe(@Request() req) {
    if (req.user.role !== 'customer') {
      throw new UnauthorizedException('Only customers can use this endpoint');
    }
    return this.documentService.findAllByCustomerEmail(req.user.email);
  }

  @Get(':customerId')
  @ApiOperation({ summary: 'Get all documents for a customer' })
  async findAll(@Param('customerId') customerId: string, @Request() req) {
    return this.documentService.findAll(customerId, req.user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a customer document' })
  async remove(@Param('id') id: string, @Request() req) {
    return this.documentService.delete(id, req.user);
  }
}
