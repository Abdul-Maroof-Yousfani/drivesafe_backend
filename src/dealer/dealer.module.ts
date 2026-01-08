import { Module } from '@nestjs/common';
import { DealerService } from './dealer.service';
import { DealerController } from './dealer.controller';
import { PrismaService } from '../prisma/prisma.service';

import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [AuthModule, ConfigModule],
  controllers: [DealerController],
  providers: [DealerService, PrismaService],
  exports: [DealerService],
})
export class DealerModule {}
