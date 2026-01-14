import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ActivityLogService } from './services/activity-log.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('activity-logs')
@Controller('activity-logs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  @ApiOperation({ summary: 'Get all activity logs with filtering and pagination' })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('module') module?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.activityLogService.getAllActivities({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      userId,
      action,
      module,
      startDate,
      endDate,
    });
  }
}
