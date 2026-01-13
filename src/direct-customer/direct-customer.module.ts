import { Module } from '@nestjs/common';
import { DirectCustomerController } from './direct-customer.controller';
import { DirectCustomerService } from './direct-customer.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [DirectCustomerController],
  providers: [DirectCustomerService],
  exports: [DirectCustomerService],
})
export class DirectCustomerModule {}
