import {
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  IsUUID,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateInvoiceDto {
  @ApiPropertyOptional({
    description: 'Invoice status',
    enum: ['pending', 'paid', 'cancelled', 'overdue'],
  })
  @IsOptional()
  @IsEnum(['pending', 'paid', 'cancelled', 'overdue'])
  status?: string;

  @ApiPropertyOptional({ description: 'Payment method' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: 'Paid date' })
  @IsOptional()
  @IsDateString()
  paidDate?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Dealer ID (Override for SA)' })
  @IsOptional()
  @IsUUID()
  dealerId?: string;
}
