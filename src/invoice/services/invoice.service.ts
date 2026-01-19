import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantDatabaseService } from '../../common/services/tenant-database.service';
import { ActivityLogService } from '../../common/services/activity-log.service';
import { GetInvoicesDto } from '../dto/get-invoices.dto';
import { UpdateInvoiceDto } from '../dto/update-invoice.dto';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private prisma: PrismaService,
    private tenantDb: TenantDatabaseService,
    private activityLog: ActivityLogService,
  ) {}

  /**
   * Get all invoices (Aggregated or Specific Dealer)
   */
  async findAll(dto: GetInvoicesDto, user: any): Promise<any> {
    const {
      page = 1,
      limit = 20,
      search,
      dealerId,
      status,
      startDate,
      endDate,
      excludeDirectSales,
    } = dto;

    let allInvoices: any[] = [];

    // Helper to build where clause
    const buildWhere = () => {
      const where: any = {};
      // Removed: where.NOT = { paymentMethod: 'dealer_assignment' };

      if (status) where.status = status;
      if (startDate || endDate) {
        where.invoiceDate = {};
        if (startDate) where.invoiceDate.gte = new Date(startDate);
        if (endDate) where.invoiceDate.lte = new Date(endDate);
        if (endDate) where.invoiceDate.lte = new Date(endDate);
      }

      if (excludeDirectSales) {
        where.dealerId = { not: null };
      }

      return where;
    };

    const includeOptions = {
      dealer: {
        select: {
          id: true,
          businessNameLegal: true,
          businessNameTrading: true,
          email: true,
          phone: true,
        },
      },
      warrantySale: {
        select: {
          id: true,
          policyNumber: true,
          warrantyPrice: true,
          customer: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          warrantyPackage: {
            select: {
              name: true,
            },
          },
        },
      },
    };

    // Case 1: Fetching for specific dealer (SA requesting specific dealer OR Dealer requesting own)
    const targetDealerId =
      user.role === 'dealer'
        ? user.dealerId
        : dealerId && dealerId !== 'all'
          ? dealerId
          : null;

    if (targetDealerId) {
      try {
        const client =
          await this.tenantDb.getTenantPrismaByDealerId(targetDealerId);
        const where = buildWhere();
        where.dealerId = targetDealerId;

        // Fetch from tenant DB
        const tenantInvoices = await client.invoice.findMany({
          where,
          include: includeOptions,
          orderBy: { invoiceDate: 'desc' },
        });
        allInvoices.push(...tenantInvoices);

        // Also check Master DB for this dealer (in case of assignments from SA)
        const masterInvoices = await this.prisma.invoice.findMany({
          where,
          include: includeOptions,
          orderBy: { invoiceDate: 'desc' },
        });
        allInvoices.push(...masterInvoices);
      } catch (err) {
        this.logger.error(
          `Error querying dealer ${targetDealerId}: ${err.message}`,
        );
        return {
          status: false,
          message: `Failed to query dealer database: ${err.message}`,
        };
      }
    } else if (
      (user.role === 'super_admin' || user.role === 'admin') &&
      (!dealerId || dealerId === 'all')
    ) {
      // Case 2: Aggregation across all dealers + Master DB
      this.logger.log('Querying all databases for aggregated invoices');

      // 1. Fetch from Master DB
      try {
        const masterInvoices = await this.prisma.invoice.findMany({
          where: buildWhere(),
          include: includeOptions,
          orderBy: { invoiceDate: 'desc' },
        });
        allInvoices.push(...masterInvoices);
      } catch (err) {
        this.logger.warn(
          `Error querying master DB for invoices: ${err.message}`,
        );
      }

      // 2. Fetch from all Tenant DBs
      try {
        const dealers = await this.prisma.dealer.findMany({
          where: { status: 'active' },
          select: { id: true },
        });

        const invoicePromises = dealers.map(async (dealer) => {
          try {
            const client = await this.tenantDb.getTenantPrismaByDealerId(
              dealer.id,
            );
            const where = buildWhere();
            where.dealerId = dealer.id;

            return await client.invoice.findMany({
              where,
              include: includeOptions,
              orderBy: { invoiceDate: 'desc' },
            });
          } catch (err) {
            this.logger.warn(
              `Error querying dealer ${dealer.id}: ${err.message}`,
            );
            return [];
          }
        });

        const results = await Promise.all(invoicePromises);
        allInvoices.push(...results.flat());
      } catch (err) {
        this.logger.error(`Error aggregating tenant invoices: ${err.message}`);
      }
    }

    // Client-side filtering (Search) & Sorting
    if (search && allInvoices.length > 0) {
      const searchLower = search.toLowerCase();
      allInvoices = allInvoices.filter((inv) => {
        return (
          inv.invoiceNumber?.toLowerCase().includes(searchLower) ||
          inv.dealer?.businessNameLegal?.toLowerCase().includes(searchLower) ||
          inv.dealer?.businessNameTrading?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Sort desc by date
    allInvoices.sort(
      (a, b) =>
        new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime(),
    );

    // Pagination
    const total = allInvoices.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedInvoices = allInvoices.slice(startIndex, endIndex);

    return {
      invoices: paginatedInvoices,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get Invoice By ID
   */
  async findOne(id: string, user: any, queryDealerId?: string): Promise<any> {
    let invoice;

    // Customer role: Search across databases (similar to warranty sale service)
    if (user.role === 'customer' && user.email) {
      return this.findCustomerInvoiceById(id, user.email);
    }

    // Determine strategy
    if (user.role === 'dealer' && user.dealerId) {
      // Dealer looking up their own invoice
      const client = await this.tenantDb.getTenantPrismaByDealerId(
        user.dealerId,
      );
      invoice = await client.invoice.findUnique({
        where: { id },
        include: {
          dealer: true,
          warrantySale: {
            include: {
              customer: true,
              vehicle: true,
              warrantyPackage: true,
            },
          },
        },
      });

      if (invoice && invoice.dealerId !== user.dealerId) {
        throw new ForbiddenException('Access denied to this invoice');
      }
    } else {
      // SA Logic
      if (queryDealerId) {
        try {
          const client =
            await this.tenantDb.getTenantPrismaByDealerId(queryDealerId);
          invoice = await client.invoice.findUnique({
            where: { id },
            include: {
              dealer: true,
              warrantySale: {
                include: {
                  customer: true,
                  vehicle: true,
                  warrantyPackage: true,
                },
              },
            },
          });
        } catch (e) {
          this.logger.warn(
            `Failed to query tenant DB for invoice: ${e.message}`,
          );
        }
      }

      // Fallback: master DB
      if (!invoice) {
        invoice = await this.prisma.invoice.findUnique({
          where: { id },
          include: {
            dealer: true,
            warrantySale: {
              include: {
                customer: true,
                vehicle: true,
                warrantyPackage: true,
              },
            },
            createdBy: true,
          },
        });
      }
    }

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  /**
   * Find customer invoice by ID (searches master and tenant DBs)
   */
  private async findCustomerInvoiceById(
    id: string,
    email: string,
  ): Promise<any> {
    this.logger.log(
      `[findCustomerInvoiceById] Customer ${email} requesting invoice ${id}`,
    );

    // Check master DB first
    const masterCustomers = await this.prisma.customer.findMany({
      where: { email, dealerId: null },
      select: { id: true },
    });

    this.logger.log(
      `[findCustomerInvoiceById] Found ${masterCustomers.length} master customers`,
    );

    if (masterCustomers.length > 0) {
      const customerIds = masterCustomers.map((c) => c.id);

      // Fetch invoice from Master DB - verify through warranty sale
      // IMPORTANT: Customers should NOT see dealer settlement invoices (dealerId is set)
      // Customers only see invoices that are NOT dealer settlement invoices (dealerId is null)
      // Try by invoice ID first, then by warrantySaleId (in case ID is actually a warranty sale ID)
      let invoice = await this.prisma.invoice.findFirst({
        where: {
          id,
          dealerId: null, // Exclude dealer settlement invoices - customers shouldn't see these
        },
        include: {
          warrantySale: {
            include: {
              customer: true,
              vehicle: true,
              warrantyPackage: true,
            },
          },
          dealer: true,
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      // If not found by invoice ID, try by warrantySaleId
      if (!invoice) {
        this.logger.log(
          `[findCustomerInvoiceById] Master DB invoice not found by ID, trying by warrantySaleId: ${id}`,
        );
        invoice = await this.prisma.invoice.findFirst({
          where: {
            warrantySaleId: id,
            dealerId: null, // Exclude dealer settlement invoices
          },
          include: {
            warrantySale: {
              include: {
                customer: true,
                vehicle: true,
                warrantyPackage: true,
              },
            },
            dealer: true,
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        });
      }

      this.logger.log(
        `[findCustomerInvoiceById] Master DB invoice found: ${!!invoice}`,
      );

      // Verify the invoice's warranty sale belongs to this customer
      if (
        invoice &&
        invoice.warrantySale &&
        invoice.warrantySale.customerId &&
        customerIds.includes(invoice.warrantySale.customerId)
      ) {
        this.logger.log(
          `[findCustomerInvoiceById] Returning master DB invoice`,
        );
        return invoice;
      }
    }

    // Check tenant DBs
    // Note: Dealer's customers are in tenant DB, not master DB
    // So we need to check all active dealers and then check their tenant DBs
    const allDealers = await this.prisma.dealer.findMany({
      where: {
        status: 'active',
        databaseName: { not: null },
      },
      select: {
        id: true,
        businessNameLegal: true,
        businessNameTrading: true,
        email: true,
        phone: true,
      },
    });

    this.logger.log(
      `[findCustomerInvoiceById] Checking ${allDealers.length} active dealers`,
    );

    const dealers: Array<{
      id: string;
      businessNameLegal: string;
      businessNameTrading: string | null;
      email: string;
      phone: string;
    }> = [];

    // Pre-filter dealers that have this customer in their tenant DB
    for (const dealer of allDealers) {
      try {
        const tenantPrisma = await this.tenantDb.getTenantPrismaByDealerId(
          dealer.id,
        );
        const customerExists = await tenantPrisma.customer.findFirst({
          where: { email },
          select: { id: true },
        });
        if (customerExists) {
          dealers.push(dealer);
        }
      } catch (error) {
        this.logger.warn(
          `[findCustomerInvoiceById] Error checking dealer ${dealer.id} for customer: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `[findCustomerInvoiceById] Found ${dealers.length} dealers with this customer`,
    );

    for (const dealer of dealers) {
      try {
        this.logger.log(
          `[findCustomerInvoiceById] Checking dealer ${dealer.id} (${dealer.businessNameTrading || dealer.businessNameLegal})`,
        );

        const tenantPrisma = await this.tenantDb.getTenantPrismaByDealerId(
          dealer.id,
        );
        const customer = await tenantPrisma.customer.findFirst({
          where: { email },
          select: { id: true },
        });

        if (!customer) {
          this.logger.warn(
            `[findCustomerInvoiceById] Customer not found in dealer ${dealer.id} tenant DB`,
          );
          continue;
        }

        this.logger.log(
          `[findCustomerInvoiceById] Customer found in dealer ${dealer.id} DB, customerId: ${customer.id}`,
        );

        // Fetch invoice from tenant DB - verify through warranty sale
        // IMPORTANT: Customers should NOT see dealer settlement invoices (dealerId is set)
        // Customers only see invoices that are NOT dealer settlement invoices (dealerId is null)
        // Try by invoice ID first, then by warrantySaleId (in case ID is actually a warranty sale ID)
        let invoice = await tenantPrisma.invoice.findFirst({
          where: {
            id,
            dealerId: null, // Exclude dealer settlement invoices - customers shouldn't see these
          },
          include: {
            warrantySale: {
              include: {
                customer: true,
                vehicle: true,
                warrantyPackage: true,
              },
            },
          },
        });

        // If not found by invoice ID, try by warrantySaleId
        if (!invoice) {
          this.logger.log(
            `[findCustomerInvoiceById] Invoice not found by ID, trying by warrantySaleId: ${id}`,
          );
          invoice = await tenantPrisma.invoice.findFirst({
            where: {
              warrantySaleId: id,
              dealerId: null, // Exclude dealer settlement invoices
            },
            include: {
              warrantySale: {
                include: {
                  customer: true,
                  vehicle: true,
                  warrantyPackage: true,
                },
              },
            },
          });
        }

        this.logger.log(
          `[findCustomerInvoiceById] Invoice found in dealer ${dealer.id} DB: ${!!invoice}`,
        );
        if (invoice) {
          this.logger.log(
            `[findCustomerInvoiceById] Invoice warrantySale: ${!!invoice.warrantySale}, customerId: ${invoice.warrantySale?.customerId}, expected: ${customer.id}`,
          );
        }

        // Verify the invoice's warranty sale belongs to this customer
        if (
          invoice &&
          invoice.warrantySale &&
          invoice.warrantySale.customerId === customer.id
        ) {
          this.logger.log(
            `[findCustomerInvoiceById] Invoice verified, fetching dealer info`,
          );

          // Fetch dealer info from Master DB
          const dealerInfo = await this.prisma.dealer.findUnique({
            where: { id: dealer.id },
            select: {
              id: true,
              businessNameLegal: true,
              businessNameTrading: true,
              businessAddress: true,
              email: true,
              phone: true,
            },
          });

          this.logger.log(
            `[findCustomerInvoiceById] Returning invoice from dealer ${dealer.id} DB`,
          );
          return {
            ...invoice,
            dealer: dealerInfo
              ? {
                  id: dealerInfo.id,
                  businessNameLegal: dealerInfo.businessNameLegal,
                  businessNameTrading: dealerInfo.businessNameTrading,
                  businessAddress: dealerInfo.businessAddress,
                  email: dealerInfo.email,
                  phone: dealerInfo.phone,
                }
              : null,
          };
        } else if (invoice) {
          this.logger.warn(
            `[findCustomerInvoiceById] Invoice found but warranty sale customerId mismatch. Invoice warrantySale customerId: ${invoice.warrantySale?.customerId}, expected: ${customer.id}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Error checking dealer ${dealer.id}: ${error.message}`,
          error.stack,
        );
      }
    }

    // If invoice not found, it might be that customer doesn't have an invoice record
    // In that case, frontend will fetch warranty sale and show it as invoice
    // This is expected behavior - customers may only have warranty sales, not invoice records
    this.logger.log(
      `[findCustomerInvoiceById] Invoice not found. This is expected if customer only has warranty sale record. Frontend will fetch warranty sale and display it as invoice.`,
    );
    throw new NotFoundException('Invoice not found');
  }

  /**
   * Update Invoice
   */
  async update(id: string, dto: UpdateInvoiceDto, user: any): Promise<any> {
    // 1. Find the invoice first to identify location
    let existingInvoice;
    let client: any = this.prisma;
    let isTenant = false;
    let targetDealerId = dto.dealerId;

    // Strategy similar to findOne but we need the client for updating
    if (user.role === 'dealer' && user.dealerId) {
      client = await this.tenantDb.getTenantPrismaByDealerId(user.dealerId);
      isTenant = true;
      targetDealerId = user.dealerId;
      existingInvoice = await client.invoice.findUnique({ where: { id } });

      if (!existingInvoice || existingInvoice.dealerId !== user.dealerId) {
        throw new NotFoundException('Invoice not found');
      }
    } else {
      // SA: Check master first
      existingInvoice = await this.prisma.invoice.findUnique({ where: { id } });

      if (!existingInvoice) {
        // Try to infer dealerId if not passed
        if (!targetDealerId) {
          // Cannot efficiently scan all DBs for update.
          // We rely on caller passing dealerId OR we can try to find via findAll? Too expensive.
          // Actually, usually the SA views the invoice (getting details) then updates. The frontend should pass dealerId.
          // If not available, we fail or try if provided.
        }

        if (targetDealerId) {
          client =
            await this.tenantDb.getTenantPrismaByDealerId(targetDealerId);
          isTenant = true;
          existingInvoice = await client.invoice.findUnique({ where: { id } });
        }
      }
    }

    if (!existingInvoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Role-based restrictions
    const data: any = {};
    if (user.role === 'dealer') {
      if (dto.notes !== undefined) data.notes = dto.notes;
      // Dealers cannot change statuses/payment methods typically
    } else {
      // SA
      if (dto.status) data.status = dto.status;
      if (dto.paymentMethod) data.paymentMethod = dto.paymentMethod;
      if (dto.notes !== undefined) data.notes = dto.notes;
      if (dto.paidDate) {
        data.paidDate = new Date(dto.paidDate);
      } else if (dto.status === 'paid' && !existingInvoice.paidDate) {
        data.paidDate = new Date();
      }
    }

    const updated = await client.invoice.update({
      where: { id },
      data,
    });

    await this.activityLog.log({
      userId: user.sub,
      action: 'update',
      module: 'invoices',
      entity: 'Invoice',
      entityId: id,
      description: `Invoice ${updated.invoiceNumber} updated`,
      oldValues: existingInvoice,
      newValues: updated,
    });

    return updated;
  }

  /**
   * Get Dealer Invoice Statistics
   */
  async getDealerStatistics(dealerId: string): Promise<{
    totalAmount: number;
    totalCount: number;
    pendingAmount: number;
    pendingCount: number;
    paidAmount: number;
    paidCount: number;
  }> {
    const allInvoices: any[] = [];

    try {
      // Fetch from tenant DB
      const client = await this.tenantDb.getTenantPrismaByDealerId(dealerId);
      const tenantInvoices = await client.invoice.findMany({
        where: { dealerId },
      });
      allInvoices.push(...tenantInvoices);

      // Also check Master DB for this dealer
      const masterInvoices = await this.prisma.invoice.findMany({
        where: { dealerId },
      });
      allInvoices.push(...masterInvoices);
    } catch (err) {
      this.logger.error(
        `Error querying dealer ${dealerId} for statistics: ${err.message}`,
      );
      throw err;
    }

    // Calculate statistics
    const total = allInvoices.reduce(
      (sum, inv) => sum + Number(inv.amount || 0),
      0,
    );
    const pending = allInvoices.filter((inv) => inv.status === 'pending');
    const paid = allInvoices.filter((inv) => inv.status === 'paid');

    return {
      totalAmount: total,
      totalCount: allInvoices.length,
      pendingAmount: pending.reduce(
        (sum, inv) => sum + Number(inv.amount || 0),
        0,
      ),
      pendingCount: pending.length,
      paidAmount: paid.reduce((sum, inv) => sum + Number(inv.amount || 0), 0),
      paidCount: paid.length,
    };
  }
}
