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
import { DealerService } from './dealer.service';
import { CreateDealerDto } from './dto/create-dealer.dto';
import { UpdateDealerDto } from './dto/update-dealer.dto';
import { VerifyCredentialsDto } from './dto/verify-credentials.dto';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('dealers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dealers')
export class DealerController {
  constructor(private readonly dealerService: DealerService) {}

  @Post()
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Create a new dealer with tenant setup' })
  create(@Body() createDealerDto: CreateDealerDto, @Req() req: any) {
    const createdById = req.user.userId;
    return this.dealerService.create(createDealerDto, createdById);
  }

  @Get()
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Get all dealers with pagination' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.dealerService.findAll({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      search,
      status,
    });
  }

  @Get(':id')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Get a dealer by id' })
  findOne(@Param('id') id: string) {
    return this.dealerService.findOne(id);
  }

  @Put(':id')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Update a dealer' })
  update(
    @Param('id') id: string,
    @Body() updateDealerDto: UpdateDealerDto,
    @Req() req: any,
  ) {
    return this.dealerService.update(id, updateDealerDto, req.user.userId);
  }

  @Delete(':id')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Delete a dealer' })
  remove(@Param('id') id: string, @Req() req: any) {
    return this.dealerService.remove(id, req.user.userId);
  }

  @Post(':id/verify-credentials')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Verify admin password and get dealer credentials' })
  async verifyCredentials(
    @Param('id') id: string,
    @Body() dto: VerifyCredentialsDto,
    @Req() req: any,
  ) {
    const credentials = await this.dealerService.verifyAndGetCredentials(
      id,
      dto.adminPassword,
      req.user.sub,
    );
    return {
      status: true,
      data: credentials,
    };
  }
}
