import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantDatabaseService } from '../../common/services/tenant-database.service';
import { ActivityLogService } from '../../common/services/activity-log.service';
import { CreateWarrantySaleDto, UpdateWarrantySaleDto } from '../dto';
import { randomUUID } from 'crypto';

@Injectable()
export class WarrantySaleService {
  private readonly logger = new Logger(WarrantySaleService.name);

  constructor(
    private prisma: PrismaService,
    private tenantDb: TenantDatabaseService,
    private activityLog: ActivityLogService,
  ) {}

  /**
   * Create warranty sale in master DB (SA)
   */
  async createMasterSale(
    dto: CreateWarrantySaleDto,
    userId: string,
  ): Promise<any> {
    const {
      customerId,
      warrantyPackageId,
      vehicleId,
      dealerId,
      duration,
      price,
      excess,
      labourRatePerHour,
      fixedClaimLimit,
      price12Months,
      price24Months,
      price36Months,
      paymentMethod,
      coverageStartDate: inputStartDate,
      salesRepresentativeName,
      customerConsent,
      customerSignature,
      mileageAtSale,
    } = dto;

    // Update vehicle mileage if applicable
    if (vehicleId && mileageAtSale) {
      const vehicle = await this.prisma.customerVehicle.findUnique({
        where: { id: vehicleId },
      });
      if (vehicle && mileageAtSale > vehicle.mileage) {
        await this.prisma.customerVehicle.update({
          where: { id: vehicleId },
          data: { mileage: mileageAtSale },
        });
      }
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const pkg = await this.prisma.warrantyPackage.findUnique({
      where: { id: warrantyPackageId },
    });
    if (!pkg) {
      throw new NotFoundException('Warranty package not found');
    }

    const now = new Date();
    const coverageStartDate = inputStartDate ? new Date(inputStartDate) : now;
    const durationMonths = duration || pkg.coverageDuration || 12;
    const coverageEndDate = new Date(coverageStartDate);
    coverageEndDate.setMonth(coverageEndDate.getMonth() + durationMonths);

    const safeNumber = (val: any) =>
      val !== undefined && val !== null && val !== '' ? Number(val) : null;

    const sale = await this.prisma.warrantySale.create({
      data: {
        customerId,
        dealerId: dealerId || null,
        salesRepresentativeName: salesRepresentativeName || null,
        warrantyPackageId,
        coverageStartDate,
        coverageEndDate,
        warrantyPrice: safeNumber(price) || 0,
        excess: safeNumber(excess),
        labourRatePerHour: safeNumber(labourRatePerHour),
        fixedClaimLimit: safeNumber(fixedClaimLimit),
        price12Months: durationMonths === 12 ? safeNumber(price12Months) : null,
        price24Months: durationMonths === 24 ? safeNumber(price24Months) : null,
        price36Months: durationMonths === 36 ? safeNumber(price36Months) : null,
        paymentMethod: paymentMethod || 'admin_assignment',
        saleDate: now,
        customerConsent: customerConsent === true,
        customerSignature:
          customerSignature || (customerConsent ? 'Accepted' : null),
        mileageAtSale: mileageAtSale || null,
        vehicleId: vehicleId || null,
        policyNumber: `CUS-${customer.id.slice(0, 6)}-${Date.now()}`,
        status: 'active',
        createdById: userId,
      },
      include: {
        customer: true,
        dealer: true,
        warrantyPackage: true,
      },
    });

    this.logger.log(`Created master warranty sale: ${sale.id}`);
    return sale;
  }

  /**
   * Create warranty sale in dealer's tenant DB
   */
  async createDealerSale(
    dto: CreateWarrantySaleDto,
    userId: string,
    dealerId: string,
  ): Promise<any> {
    const client = await this.tenantDb.getTenantPrismaByDealerId(dealerId);

    const {
      customerId,
      warrantyPackageId,
      vehicleId,
      duration,
      paymentMethod,
      coverageStartDate: inputStartDate,
      salesRepresentativeName,
      customerConsent,
      customerSignature,
      mileageAtSale,
    } = dto;

    // Validate customer in tenant DB
    const customer = await client.customer.findUnique({
      where: { id: customerId },
      include: { vehicles: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found in dealer database');
    }

    // Validate vehicle if provided
    if (vehicleId) {
      const vehicle = await client.customerVehicle.findUnique({
        where: { id: vehicleId },
      });
      if (!vehicle || vehicle.customerId !== customerId) {
        throw new BadRequestException(
          'Invalid vehicle selected for this customer',
        );
      }
    }

    // Get package from tenant DB
    const pkg = await client.warrantyPackage.findUnique({
      where: { id: warrantyPackageId },
    });
    if (!pkg) {
      throw new NotFoundException(
        'Warranty package not found in dealer database',
      );
    }

    const now = new Date();
    const coverageStartDate = inputStartDate ? new Date(inputStartDate) : now;
    const durationMonths = duration || pkg.coverageDuration || 12;
    const coverageEndDate = new Date(coverageStartDate);
    coverageEndDate.setMonth(coverageEndDate.getMonth() + durationMonths);

    // Update vehicle mileage if applicable
    if (vehicleId && mileageAtSale) {
      const currentVehicle = await client.customerVehicle.findUnique({
        where: { id: vehicleId },
      });
      if (currentVehicle && mileageAtSale > currentVehicle.mileage) {
        await client.customerVehicle.update({
          where: { id: vehicleId },
          data: { mileage: mileageAtSale },
        });
      }
    }

    // Fixed customer price from package
    const fixedCustomerPrice =
      durationMonths === 12
        ? Number(pkg.price12Months) || 0
        : durationMonths === 24
          ? Number(pkg.price24Months) || 0
          : Number(pkg.price36Months) || Number(pkg.price) || 0;

    const tenantSale = await client.warrantySale.create({
      data: {
        customerId,
        vehicleId: vehicleId || null,
        dealerId,
        salesRepresentativeName: salesRepresentativeName || null,
        warrantyPackageId,
        coverageStartDate,
        coverageEndDate,
        warrantyPrice: fixedCustomerPrice,
        excess: pkg.excess ?? null,
        labourRatePerHour: pkg.labourRatePerHour ?? null,
        fixedClaimLimit: pkg.fixedClaimLimit ?? null,
        price12Months: pkg.price12Months ?? null,
        price24Months: pkg.price24Months ?? null,
        price36Months: pkg.price36Months ?? null,
        dealerCost12Months: pkg.dealerPrice12Months ?? null,
        dealerCost24Months: pkg.dealerPrice24Months ?? null,
        dealerCost36Months: pkg.dealerPrice36Months ?? null,
        paymentMethod: paymentMethod || 'cash',
        saleDate: now,
        customerConsent: customerConsent === true,
        customerSignature: customerSignature || null,
        mileageAtSale: mileageAtSale || null,
        policyNumber: `CUS-${customer.id.slice(0, 6)}-${Date.now()}`,
        status: 'active',
        createdById: userId,
      },
      include: {
        customer: true,
        vehicle: true,
        warrantyPackage: true,
      },
    });

    // Create invoice in tenant DB
    const dealerCost =
      durationMonths === 12
        ? Number(pkg.dealerPrice12Months) || 0
        : durationMonths === 24
          ? Number(pkg.dealerPrice24Months) || 0
          : Number(pkg.dealerPrice36Months) || 0;

    if (dealerId && dealerCost > 0) {
      try {
        const invoiceNumber = `INV-${dealerId.slice(0, 6).toUpperCase()}-${Date.now()}`;
        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + 30);

        await client.invoice.create({
          data: {
            id: randomUUID(),
            invoiceNumber,
            warrantySaleId: tenantSale.id,
            dealerId,
            amount: dealerCost,
            status: 'pending',
            invoiceDate: now,
            dueDate,
            paymentMethod,
          },
        });
      } catch (invoiceError) {
        this.logger.warn(`Failed to create invoice: ${invoiceError.message}`);
      }
    }

    await this.activityLog.log({
      userId,
      action: 'create',
      module: 'warranty-sales',
      entity: 'WarrantySale',
      entityId: tenantSale.id,
      description: `Dealer created warranty sale for customer ${customer.firstName} ${customer.lastName}`,
      newValues: tenantSale,
    });

    return tenantSale;
  }

  /**
   * Get all warranty sales (SA)
   */
  async findAll(filters: {
    status?: string;
    dealerId?: string;
    startDate?: string;
    endDate?: string;
    role?: string;
    userId?: string;
  }): Promise<any[]> {
    const { status, dealerId, startDate, endDate, role, userId } = filters;

    const where: any = {};
    if (status) where.status = status;
    if (dealerId) where.dealerId = dealerId;
    if (startDate || endDate) {
      where.saleDate = {};
      if (startDate) where.saleDate.gte = new Date(startDate);
      if (endDate) where.saleDate.lte = new Date(endDate);
    }
    if (role === 'admin' && userId) {
      where.createdById = userId;
    }

    return this.prisma.warrantySale.findMany({
      where,
      include: {
        customer: true,
        dealer: true,
        vehicle: true,
        warrantyPackage: {
          select: {
            id: true,
            name: true,
            planLevel: true,
            description: true,
            price12Months: true,
            price24Months: true,
            price36Months: true,
            dealerPrice12Months: true,
            dealerPrice24Months: true,
            dealerPrice36Months: true,
            excess: true,
            labourRatePerHour: true,
            fixedClaimLimit: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get dealer's warranty sales from tenant DB
   */
  async getDealerSales(dealerId: string): Promise<any[]> {
    const client = await this.tenantDb.getTenantPrismaByDealerId(dealerId);

    return client.warrantySale.findMany({
      where: {
        customerId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true,
        vehicle: true,
        warrantyPackage: true,
      },
    });
  }

  /**
   * Get warranty sale by ID
   */
  async findOne(
    id: string,
    user: { role: string; userId: string; email?: string; dealerId?: string },
  ): Promise<any> {
    const { role, userId, email, dealerId } = user;

    // For customers, search across databases
    if (role === 'customer' && email) {
      return this.findCustomerSaleById(id, email);
    }

    if (role === 'dealer') {
      if (!dealerId) {
        throw new BadRequestException('Dealer context required');
      }

      const client = await this.tenantDb.getTenantPrismaByDealerId(dealerId);
      const sale = await client.warrantySale.findFirst({
        where: { id, dealerId },
        include: {
          customer: true,
          vehicle: true,
          warrantyPackage: {
            include: {
              items: {
                include: { warrantyItem: true },
              },
            },
          },
          // Note: Tenant schema doesn't have createdBy relation, only createdById field
        },
      });

      if (!sale) {
        throw new NotFoundException('Warranty sale not found');
      }

      const dealer = await this.prisma.dealer.findUnique({
        where: { id: dealerId },
        select: {
          id: true,
          businessNameLegal: true,
          businessNameTrading: true,
          businessAddress: true,
          email: true,
          phone: true,
        },
      });

      return {
        ...sale,
        dealer: dealer
          ? {
              id: dealer.id,
              businessNameLegal: dealer.businessNameLegal,
              businessNameTrading: dealer.businessNameTrading,
              businessAddress: dealer.businessAddress,
              email: dealer.email,
              phone: dealer.phone,
            }
          : null,
      };
    }

    // For other roles
    const where: any = { id };
    if (role === 'admin' && userId) {
      where.createdById = userId;
    }

    const sale = await this.prisma.warrantySale.findFirst({
      where,
      include: {
        customer: true,
        vehicle: true,
        dealer: true,
        warrantyPackage: {
          include: {
            items: {
              include: {
                warrantyItem: true,
              },
            },
          },
        },
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

    if (!sale) {
      throw new NotFoundException('Warranty sale not found');
    }

    return sale;
  }

  /**
   * Update warranty sale
   */
  async update(
    id: string,
    dto: UpdateWarrantySaleDto,
    user: { role: string; userId: string },
  ): Promise<any> {
    const { role, userId } = user;

    const existing = await this.prisma.warrantySale.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Warranty sale not found');
    }

    if (role === 'admin' && existing.createdById !== userId) {
      throw new ForbiddenException('Not authorized to update this sale');
    }

    const updated = await this.prisma.warrantySale.update({
      where: { id },
      data: {
        salesRepresentativeName:
          dto.salesRepresentativeName ?? existing.salesRepresentativeName,
        warrantyPrice:
          dto.warrantyPrice !== undefined
            ? dto.warrantyPrice
            : existing.warrantyPrice,
        paymentMethod: dto.paymentMethod ?? existing.paymentMethod,
        coverageStartDate: dto.coverageStartDate
          ? new Date(dto.coverageStartDate)
          : existing.coverageStartDate,
        coverageEndDate: dto.coverageEndDate
          ? new Date(dto.coverageEndDate)
          : existing.coverageEndDate,
        status: dto.status ?? existing.status,
      },
      include: {
        customer: true,
        dealer: true,
        warrantyPackage: true,
      },
    });

    // Sync to tenant DB if applicable
    if (updated.dealerId && role === 'super_admin') {
      try {
        const tenantPrisma = await this.tenantDb.getTenantPrismaByDealerId(
          updated.dealerId,
        );
        await tenantPrisma.warrantySale.updateMany({
          where: { id: updated.id },
          data: {
            salesRepresentativeName: updated.salesRepresentativeName,
            warrantyPrice: updated.warrantyPrice,
            paymentMethod: updated.paymentMethod,
            coverageStartDate: updated.coverageStartDate,
            coverageEndDate: updated.coverageEndDate,
            status: updated.status,
          },
        });
        this.logger.log(`Synced sale ${updated.id} to tenant DB`);
      } catch (err) {
        this.logger.error(`Failed to sync to tenant DB: ${err.message}`);
      }
    }

    await this.activityLog.log({
      userId,
      action: 'update',
      module: 'warranty-sales',
      entity: 'WarrantySale',
      entityId: id,
      description: `Updated warranty sale ${existing.policyNumber}`,
      oldValues: existing,
      newValues: updated,
    });

    return updated;
  }

  /**
   * Delete warranty sale
   */
  async delete(
    id: string,
    user: { role: string; userId: string },
  ): Promise<void> {
    const { role, userId } = user;

    const existing = await this.prisma.warrantySale.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Warranty sale not found');
    }

    if (role === 'admin' && existing.createdById !== userId) {
      throw new ForbiddenException('Not authorized to delete this sale');
    }

    // Delete from tenant DB if applicable
    if (existing.dealerId) {
      try {
        const tenantPrisma = await this.tenantDb.getTenantPrismaByDealerId(
          existing.dealerId,
        );
        await tenantPrisma.warrantySale.deleteMany({
          where: {
            OR: [{ id }, { policyNumber: existing.policyNumber }],
          },
        });
      } catch (err) {
        this.logger.warn(`Failed to delete from tenant DB: ${err.message}`);
      }
    }

    await this.prisma.warrantySale.delete({ where: { id } });

    await this.activityLog.log({
      userId,
      action: 'delete',
      module: 'warranty-sales',
      entity: 'WarrantySale',
      entityId: id,
      description: `Deleted warranty sale ${existing.policyNumber}`,
      oldValues: existing,
    });
  }

  /**
   * Get customer's warranties across all databases
   * Optimized: First checks if customer is SA's (master DB) or dealer's (tenant DB)
   */
  async getCustomerWarranties(email: string): Promise<any[]> {
    const allSales: any[] = [];

    // Step 1: Check if customer is SA's customer (in master DB with dealerId = null)
    try {
      const masterCustomers = await this.prisma.customer.findMany({
        where: {
          email,
          dealerId: null, // SA's customers have no dealerId
        },
        select: { id: true },
      });

      if (masterCustomers.length > 0) {
        // Customer is SA's customer - fetch from master DB only
        const customerIds = masterCustomers.map((c) => c.id);
        const masterSales = await this.prisma.warrantySale.findMany({
          where: {
            customerId: { in: customerIds },
            status: 'active',
          },
          include: {
            warrantyPackage: {
              include: {
                items: {
                  include: { warrantyItem: true },
                },
              },
            },
            vehicle: true,
            dealer: {
              select: {
                id: true,
                businessNameLegal: true,
                businessNameTrading: true,
                email: true,
                phone: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });
        allSales.push(...masterSales);

        // SA customer found, no need to check tenant DBs
        allSales.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        return allSales;
      }
    } catch (error) {
      this.logger.error(`Error fetching from master DB: ${error.message}`);
    }

    // Step 2: Customer is not SA's customer, check tenant DBs for dealer customers
    // Find which dealer has this customer
    const dealers = await this.prisma.dealer.findMany({
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

    for (const dealer of dealers) {
      try {
        const tenantPrisma = await this.tenantDb.getTenantPrismaByDealerId(
          dealer.id,
        );
        const customer = await tenantPrisma.customer.findFirst({
          where: { email },
          select: { id: true },
        });

        if (!customer) continue;

        // Customer found in this dealer's tenant DB - fetch warranties from here
        const tenantSales = await tenantPrisma.warrantySale.findMany({
          where: {
            customerId: customer.id,
            status: 'active',
          },
          include: {
            warrantyPackage: {
              include: {
                items: {
                  include: { warrantyItem: true },
                },
              },
            },
            vehicle: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        for (const sale of tenantSales) {
          allSales.push({
            ...sale,
            dealer: {
              id: dealer.id,
              businessNameLegal: dealer.businessNameLegal,
              businessNameTrading: dealer.businessNameTrading,
              email: dealer.email,
              phone: dealer.phone,
            },
          });
        }

        // Found customer in this dealer's DB, no need to check other dealers
        break;
      } catch (error) {
        this.logger.error(
          `Error fetching from dealer ${dealer.id}: ${error.message}`,
        );
      }
    }

    // Sort by creation date
    allSales.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return allSales;
  }

  /**
   * Helper: Find customer sale by ID across databases
   */
  private async findCustomerSaleById(id: string, email: string): Promise<any> {
    // Check master DB first
    const masterCustomers = await this.prisma.customer.findMany({
      where: { email, dealerId: null },
      select: { id: true },
    });

    if (masterCustomers.length > 0) {
      const sale = await this.prisma.warrantySale.findFirst({
        where: {
          id,
          customerId: { in: masterCustomers.map((c) => c.id) },
        },
        include: {
          customer: true,
          vehicle: true,
          warrantyPackage: {
            include: {
              items: {
                include: { warrantyItem: true },
              },
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

      if (sale) return sale;
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

    for (const dealer of allDealers) {
      try {
        const tenantPrisma = await this.tenantDb.getTenantPrismaByDealerId(
          dealer.id,
        );
        const customer = await tenantPrisma.customer.findFirst({
          where: { email },
          select: { id: true },
        });

        if (!customer) continue;

        const sale = await tenantPrisma.warrantySale.findFirst({
          where: { id, customerId: customer.id },
          include: {
            customer: true,
            vehicle: true,
            warrantyPackage: {
              include: {
                items: {
                  include: { warrantyItem: true },
                },
              },
            },
          },
        });

        if (sale) {
          return {
            ...sale,
            dealer: {
              id: dealer.id,
              businessNameLegal: dealer.businessNameLegal,
              businessNameTrading: dealer.businessNameTrading,
              email: dealer.email,
              phone: dealer.phone,
            },
          };
        }
      } catch (error) {
        this.logger.error(
          `Error checking dealer ${dealer.id}: ${error.message}`,
        );
      }
    }

    throw new NotFoundException('Warranty sale not found');
  }
}
