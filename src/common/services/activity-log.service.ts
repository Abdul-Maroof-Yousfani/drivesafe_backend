import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface ActivityLogData {
  userId?: string;
  action: string;
  module?: string;
  entity?: string;
  entityId?: string;
  description?: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  userAgent?: string;
  status?: string;
  errorMessage?: string;
  metadata?: any;
}

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(private prisma: PrismaService) {}

  async log(data: ActivityLogData) {
    try {
      const activityLog = await this.prisma.activityLog.create({
        data: {
          userId: data.userId || null,
          action: data.action,
          module: data.module || null,
          entity: data.entity || null,
          entityId: data.entityId?.toString() || null,
          description: data.description || null,
          oldValues: data.oldValues ? JSON.stringify(data.oldValues) : null,
          newValues: data.newValues ? JSON.stringify(data.newValues) : null,
          ipAddress: data.ipAddress || null,
          userAgent: data.userAgent || null,
          status: data.status || 'success',
          errorMessage: data.errorMessage || null,
          metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      return activityLog;
    } catch (error: any) {
      this.logger.error('Activity log error:', error);
      return null;
    }
  }

  async logLogin(
    userId: string,
    ipAddress: string,
    userAgent: string,
    status: string,
    failReason?: string,
  ) {
    await this.log({
      userId,
      action: 'login',
      module: 'auth',
      description: status === 'success' ? 'User logged in' : 'Login failed',
      ipAddress,
      userAgent,
      status,
      errorMessage: failReason,
    });

    await this.prisma.loginHistory.create({
      data: { userId, ipAddress, userAgent, status, failReason },
    });
  }

  async logLogout(userId: string, ipAddress: string, userAgent: string) {
    await this.log({
      userId,
      action: 'logout',
      module: 'auth',
      description: 'User logged out',
      ipAddress,
      userAgent,
    });
  }

  async logPasswordChange(
    userId: string,
    ipAddress: string,
    userAgent: string,
  ) {
    await this.log({
      userId,
      action: 'password_change',
      module: 'auth',
      description: 'Password changed',
      ipAddress,
      userAgent,
    });
  }

  async getLoginHistory(userId: string, limit = 10) {
    return this.prisma.loginHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getAllActivities(
    options: {
      page?: number;
      limit?: number;
      userId?: string;
      action?: string;
      module?: string;
      startDate?: string;
      endDate?: string;
    } = {},
  ) {
    const {
      page = 1,
      limit = 50,
      userId,
      action,
      module,
      startDate,
      endDate,
    } = options;

    const where: any = {};
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (module) where.module = module;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [logs, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return { logs, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
