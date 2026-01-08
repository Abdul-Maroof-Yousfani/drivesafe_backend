import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

// Controllers
import { WarrantyItemController } from './warranty-item.controller';
import { WarrantyPackageController } from './warranty-package.controller';
import { WarrantySaleController } from './warranty-sale.controller';

// Services
import { WarrantyItemService } from './services/warranty-item.service';
import { WarrantyPackageService } from './services/warranty-package.service';
import { WarrantySaleService } from './services/warranty-sale.service';

import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, ConfigModule, AuthModule],
  controllers: [
    WarrantyItemController,
    WarrantyPackageController,
    WarrantySaleController,
  ],
  providers: [WarrantyItemService, WarrantyPackageService, WarrantySaleService],
  exports: [WarrantyItemService, WarrantyPackageService, WarrantySaleService],
})
export class WarrantyModule {}
