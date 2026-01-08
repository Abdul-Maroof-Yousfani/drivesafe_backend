import {
  IsString,
  IsOptional,
  IsNumber,
  IsUUID,
  IsHexColor,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpsertInvoiceTemplateDto {
  @ApiPropertyOptional({ description: 'Company Name' })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional({ description: 'Company Address (multiline)' })
  @IsOptional()
  @IsString()
  companyAddress?: string;

  @ApiPropertyOptional({ description: 'Logo URL' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  // Offsets
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  logoOffsetX?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  logoOffsetY?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  invoiceInfoOffsetX?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  invoiceInfoOffsetY?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  companyInfoOffsetX?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  companyInfoOffsetY?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  billToOffsetX?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  billToOffsetY?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  durationOffsetX?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  durationOffsetY?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  notesOffsetX?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  notesOffsetY?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  termsOffsetX?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  termsOffsetY?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  footerOffsetX?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  footerOffsetY?: number;

  @ApiPropertyOptional({ description: 'Primary Color (Hex)' })
  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @ApiPropertyOptional({ description: 'Accent Color (Hex)' })
  @IsOptional()
  @IsHexColor()
  accentColor?: string;

  @ApiPropertyOptional({ description: 'Font Family' })
  @IsOptional()
  @IsString()
  font?: string;

  @ApiPropertyOptional({ description: 'Header Text' })
  @IsOptional()
  @IsString()
  headerText?: string;

  @ApiPropertyOptional({ description: 'Bill To Title' })
  @IsOptional()
  @IsString()
  billToTitle?: string;

  @ApiPropertyOptional({ description: 'Notes Heading' })
  @IsOptional()
  @IsString()
  notesHeading?: string;

  @ApiPropertyOptional({ description: 'Footer Text' })
  @IsOptional()
  @IsString()
  footerText?: string;

  @ApiPropertyOptional({ description: 'Default Notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Terms Heading' })
  @IsOptional()
  @IsString()
  termsHeading?: string;

  @ApiPropertyOptional({ description: 'Default Terms Text' })
  @IsOptional()
  @IsString()
  termsText?: string;

  @ApiPropertyOptional({ description: 'Dealer ID (Override for SA)' })
  @IsOptional()
  @IsUUID()
  dealerId?: string;
}
