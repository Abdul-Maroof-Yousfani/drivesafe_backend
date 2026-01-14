import { Module } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CustomerController } from './customer.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';
import { CustomerDocumentService } from './services/customer-document.service';
import { CustomerDocumentController } from './customer-document.controller';
import { UploadModule } from '../upload/upload.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [PrismaModule, ConfigModule, AuthModule, UploadModule, CommonModule],
  controllers: [CustomerController, CustomerDocumentController],
  providers: [CustomerService, CustomerDocumentService],
  exports: [CustomerService, CustomerDocumentService],
})
export class CustomerModule {}
