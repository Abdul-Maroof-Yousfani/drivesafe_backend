import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

// Controllers
import { WarrantyItemController } from './warranty-item.controller';
import { WarrantyPackageController } from './warranty-package.controller';
import { WarrantySaleController } from './warranty-sale.controller';
import { WarrantyPlanLevelController } from './warranty-plan-level.controller';

// Services
import { WarrantyItemService } from './services/warranty-item.service';
import { WarrantyPackageService } from './services/warranty-package.service';
import { WarrantySaleService } from './services/warranty-sale.service';
import { WarrantyPlanLevelService } from './services/warranty-plan-level.service';

import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, ConfigModule, AuthModule],
  controllers: [
    WarrantyItemController,
    WarrantyPackageController,
    WarrantySaleController,
    WarrantyPlanLevelController,
  ],
  providers: [
    WarrantyItemService,
    WarrantyPackageService,
    WarrantySaleService,
    WarrantyPlanLevelService,
  ],
  exports: [
    WarrantyItemService,
    WarrantyPackageService,
    WarrantySaleService,
    WarrantyPlanLevelService,
  ],
})
export class WarrantyModule {}
