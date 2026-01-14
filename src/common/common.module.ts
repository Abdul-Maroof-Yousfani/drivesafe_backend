import { Module, Global } from '@nestjs/common';
import { ActivityLogService } from './services/activity-log.service';
import { TenantDatabaseService } from './services/tenant-database.service';
import { GoogleSheetsService } from './services/google-sheets.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

import { ActivityLogController } from './activity-log.controller';
import { forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [PrismaModule, ConfigModule, forwardRef(() => AuthModule)],
  controllers: [ActivityLogController],
  providers: [ActivityLogService, TenantDatabaseService, GoogleSheetsService],
  exports: [ActivityLogService, TenantDatabaseService, GoogleSheetsService],
})
export class CommonModule {}
