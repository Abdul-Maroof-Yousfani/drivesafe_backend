import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantDatabaseService } from '../../common/services/tenant-database.service';
import { UpsertInvoiceTemplateDto } from '../dto/upsert-invoice-template.dto';

@Injectable()
export class InvoiceTemplateService {
  private readonly logger = new Logger(InvoiceTemplateService.name);

  constructor(
    private prisma: PrismaService,
    private tenantDb: TenantDatabaseService,
  ) {}

  /**
   * Determine the target Prisma client and dealer context
   */
  private async getClientContext(user: any, queryDealerId?: string) {
    let client: any = this.prisma;
    let isTenant = false;
    let targetDealerId: string | null = null;

    if (user.role === 'dealer' && user.dealerId) {
      // Dealer context: use tenant DB
      client = await this.tenantDb.getTenantPrismaByDealerId(user.dealerId);
      isTenant = true;
      targetDealerId = user.dealerId;
    } else if (queryDealerId) {
      // SA accessing specific dealer: use tenant DB
      try {
        client = await this.tenantDb.getTenantPrismaByDealerId(queryDealerId);
        isTenant = true;
        targetDealerId = queryDealerId;
      } catch (e) {
        this.logger.warn(
          `Could not connect to tenant DB for dealer ${queryDealerId}: ${e.message}`,
        );
        // Fallback or error handling depending on usage
      }
    } else {
      // SA accessing master DB (global template)
      targetDealerId = null;
    }

    return { client, isTenant, targetDealerId };
  }

  /**
   * Upsert Invoice Template
   */
  async upsertTemplate(dto: UpsertInvoiceTemplateDto, user: any): Promise<any> {
    const { client, isTenant, targetDealerId } = await this.getClientContext(
      user,
      dto.dealerId,
    );

    let existingTemplate;

    if (isTenant) {
      // Find potentially existing template in tenant DB
      // Assuming tenant DB stores template with dealerId reference or single record
      existingTemplate = await client.invoiceTemplate.findFirst({
        where: targetDealerId ? { dealerId: targetDealerId } : {},
      });
      // Fallback
      if (!existingTemplate) {
        existingTemplate = await client.invoiceTemplate.findFirst();
      }
    } else {
      // Master DB
      if (dto.dealerId) {
        existingTemplate = await client.invoiceTemplate.findUnique({
          where: { dealerId: dto.dealerId },
        });
      } else {
        existingTemplate = await client.invoiceTemplate.findFirst({
          where: { dealerId: null },
        });
      }
    }

    const data: any = {
      companyName: dto.companyName,
      companyAddress: dto.companyAddress,
      logoUrl: dto.logoUrl,
      logoOffsetX: dto.logoOffsetX ?? 0,
      logoOffsetY: dto.logoOffsetY ?? 0,
      invoiceInfoOffsetX: dto.invoiceInfoOffsetX ?? 0,
      invoiceInfoOffsetY: dto.invoiceInfoOffsetY ?? 0,
      companyInfoOffsetX: dto.companyInfoOffsetX ?? 0,
      companyInfoOffsetY: dto.companyInfoOffsetY ?? 0,
      billToOffsetX: dto.billToOffsetX ?? 0,
      billToOffsetY: dto.billToOffsetY ?? 0,
      durationOffsetX: dto.durationOffsetX ?? 0,
      durationOffsetY: dto.durationOffsetY ?? 0,
      notesOffsetX: dto.notesOffsetX ?? 0,
      notesOffsetY: dto.notesOffsetY ?? 0,
      termsOffsetX: dto.termsOffsetX ?? 0,
      termsOffsetY: dto.termsOffsetY ?? 0,
      footerOffsetX: dto.footerOffsetX ?? 0,
      footerOffsetY: dto.footerOffsetY ?? 0,
      primaryColor: dto.primaryColor,
      accentColor: dto.accentColor,
      font: dto.font,
      headerText: dto.headerText,
      billToTitle: dto.billToTitle,
      notesHeading: dto.notesHeading,
      footerText: dto.footerText,
      notes: dto.notes,
      termsHeading: dto.termsHeading,
      termsText: dto.termsText,
    };

    // Only set dealerId explicitly if in Master DB or Schema requires it
    if (targetDealerId && !isTenant) {
      data.dealerId = targetDealerId;
    }
    // In tenant DB, usually the template is just one record,
    // but if the schema enforces dealerId, we set it.
    if (isTenant && targetDealerId) {
      data.dealerId = targetDealerId;
    }

    if (existingTemplate) {
      return client.invoiceTemplate.update({
        where: { id: existingTemplate.id },
        data,
      });
    } else {
      return client.invoiceTemplate.create({
        data,
      });
    }
  }

  /**
   * Get Invoice Template
   */
  async getTemplate(
    user: any,
    queryDealerId?: string,
    scope?: string,
  ): Promise<any> {
    // Handling "master" scope override (SA wants master template)
    if (scope === 'master') {
      const template = await this.prisma.invoiceTemplate.findFirst({
        where: { dealerId: null },
      });
      return template;
    }

    const { client, isTenant, targetDealerId } = await this.getClientContext(
      user,
      queryDealerId,
    );

    let template;

    if (isTenant) {
      if (targetDealerId) {
        template = await client.invoiceTemplate.findFirst({
          where: { dealerId: targetDealerId },
        });
      }
      if (!template) {
        template = await client.invoiceTemplate.findFirst();
      }
    } else {
      // Master DB logic
      if (targetDealerId) {
        template = await client.invoiceTemplate.findUnique({
          where: { dealerId: targetDealerId },
        });
      } else {
        template = await client.invoiceTemplate.findFirst({
          where: { dealerId: null },
        });
      }
    }

    // Auto-create default template if missing and we have a dealer context
    if (targetDealerId && !template) {
      try {
        // Fetch dealer info. Dealer info is always in Master DB (referenced by id)
        // Accessing this.prisma even if client might be tenant client
        const dealer = await this.prisma.dealer.findUnique({
          where: { id: targetDealerId },
          select: {
            businessNameTrading: true,
            businessNameLegal: true,
            businessAddress: true,
            email: true,
            phone: true,
          },
        });

        if (dealer) {
          const defaultData = {
            dealerId: targetDealerId,
            companyName: dealer.businessNameTrading || dealer.businessNameLegal,
            companyAddress: [dealer.businessAddress, dealer.email, dealer.phone]
              .filter(Boolean)
              .join('\n'),
            logoUrl: null,
            primaryColor: '#0f172a',
            accentColor: '#f1f5f9',
            font: 'Helvetica',
            headerText: 'INVOICE',
            billToTitle: 'Bill To:',
            notesHeading: 'Notes',
            footerText: 'Thank you for your business!',
            notes: null,
            termsHeading: 'Terms & Conditions',
            termsText: null,
          };

          template = await client.invoiceTemplate.create({
            data: defaultData,
          });
        }
      } catch (err) {
        this.logger.warn(
          `Failed to auto-create default template: ${err.message}`,
        );
      }
    }

    // Fallback if still empty (and not strictly request for specific dealer)
    if (!template && !targetDealerId && !isTenant) {
      template = await client.invoiceTemplate.findFirst({
        where: { dealerId: null },
      });
    }

    return template;
  }
}
