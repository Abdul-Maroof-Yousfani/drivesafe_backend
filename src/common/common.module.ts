import { Module, Global } from '@nestjs/common';
import { ActivityLogService } from './services/activity-log.service';
import { TenantDatabaseService } from './services/tenant-database.service';
import { GoogleSheetsService } from './services/google-sheets.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

@Global()
@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [ActivityLogService, TenantDatabaseService, GoogleSheetsService],
  exports: [ActivityLogService, TenantDatabaseService, GoogleSheetsService],
})
export class CommonModule {}
