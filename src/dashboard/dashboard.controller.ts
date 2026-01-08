import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Get dashboard data based on user role' })
  async getDashboard(@Req() req: any) {
    const role = req.user?.role;

    if (role === 'super_admin' || role === 'admin') {
      return this.dashboardService.getSuperAdminDashboard();
    } else if (role === 'dealer') {
      return this.dashboardService.getDealerDashboard(req.user);
    } else if (role === 'customer') {
      return this.dashboardService.getCustomerDashboard(req.user);
    }

    return { status: false, message: 'Invalid role' };
  }

  @Get('super-admin')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Get Super Admin dashboard' })
  getSuperAdminDashboard() {
    return this.dashboardService.getSuperAdminDashboard();
  }

  @Get('dealer')
  @Roles('dealer')
  @ApiOperation({ summary: 'Get Dealer dashboard' })
  getDealerDashboard(@Req() req: any) {
    return this.dashboardService.getDealerDashboard(req.user);
  }

  @Get('customer')
  @Roles('customer')
  @ApiOperation({ summary: 'Get Customer dashboard' })
  getCustomerDashboard(@Req() req: any) {
    return this.dashboardService.getCustomerDashboard(req.user);
  }
}
