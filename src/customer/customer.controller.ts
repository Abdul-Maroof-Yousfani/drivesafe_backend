import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  UseGuards,
  Query,
  Req,
} from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  @Roles('admin', 'super_admin', 'dealer')
  @ApiOperation({ summary: 'Create a new customer' })
  create(@Body() createCustomerDto: CreateCustomerDto, @Req() req: any) {
    return this.customerService.create(createCustomerDto, req.user);
  }

  @Get()
  @Roles('admin', 'super_admin', 'dealer')
  @ApiOperation({ summary: 'Get all customers' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Req() req?: any,
  ) {
    return this.customerService.findAll(
      {
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
        search,
      },
      req.user,
    );
  }

  @Get(':id')
  @Roles('admin', 'super_admin', 'dealer')
  @ApiOperation({ summary: 'Get a customer by id' })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.customerService.findOne(id, req.user);
  }

  @Put(':id')
  @Roles('admin', 'super_admin', 'dealer')
  @ApiOperation({ summary: 'Update a customer' })
  update(@Param('id') id: string, @Body() updateData: any, @Req() req: any) {
    return this.customerService.update(id, updateData, req.user);
  }

  @Delete(':id')
  @Roles('admin', 'super_admin', 'dealer')
  @ApiOperation({ summary: 'Delete a customer' })
  remove(@Param('id') id: string, @Req() req: any) {
    return this.customerService.remove(id, req.user);
  }

  @Post(':customerId/vehicles')
  @Roles('admin', 'super_admin', 'dealer')
  @ApiOperation({ summary: 'Add a vehicle to a customer' })
  addVehicle(
    @Param('customerId') customerId: string,
    @Body() createVehicleDto: CreateVehicleDto,
    @Req() req: any,
  ) {
    return this.customerService.addVehicle(
      customerId,
      createVehicleDto,
      req.user,
    );
  }

  @Put('vehicles/:vehicleId')
  @Roles('admin', 'super_admin', 'dealer')
  @ApiOperation({ summary: 'Update a vehicle' })
  updateVehicle(
    @Param('vehicleId') vehicleId: string,
    @Body() updateVehicleDto: UpdateVehicleDto,
    @Req() req: any,
  ) {
    return this.customerService.updateVehicle(
      vehicleId,
      updateVehicleDto,
      req.user,
    );
  }

  @Delete('vehicles/:vehicleId')
  @Roles('admin', 'super_admin', 'dealer')
  @ApiOperation({ summary: 'Delete a vehicle' })
  deleteVehicle(@Param('vehicleId') vehicleId: string, @Req() req: any) {
    return this.customerService.deleteVehicle(vehicleId, req.user);
  }
}
