import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';

import { InvoiceController } from './invoice.controller';
import { InvoiceTemplateController } from './invoice-template.controller';

import { InvoiceService } from './services/invoice.service';
import { InvoiceTemplateService } from './services/invoice-template.service';

@Module({
  imports: [PrismaModule, ConfigModule, AuthModule],
  controllers: [InvoiceController, InvoiceTemplateController],
  providers: [InvoiceService, InvoiceTemplateService],
  exports: [InvoiceService, InvoiceTemplateService],
})
export class InvoiceModule {}
