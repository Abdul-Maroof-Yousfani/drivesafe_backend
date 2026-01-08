import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantDatabaseService } from '../../common/services/tenant-database.service';
import { ActivityLogService } from '../../common/services/activity-log.service';
import {
  CreateWarrantyPackageDto,
  UpdateWarrantyPackageDto,
  AssignPackageToDealerDto,
} from '../dto';
import { randomUUID } from 'crypto';

@Injectable()
export class WarrantyPackageService {
  private readonly logger = new Logger(WarrantyPackageService.name);

  constructor(
    private prisma: PrismaService,
    private tenantDb: TenantDatabaseService,
    private activityLog: ActivityLogService,
  ) {}

  /**
   * Create a new warranty package
   */
  async create(dto: CreateWarrantyPackageDto, userId: string): Promise<any> {
    const {
      name,
      context,
      description,
      planLevel,
      eligibility,
      excess,
      labourRatePerHour,
      fixedClaimLimit,
      price12Months,
      price24Months,
      price36Months,
      durationValue,
      durationUnit,
      price,
      keyBenefits,
      includedFeatures,
    } = dto;

    // Validate context-specific requirements
    const allowedContexts = ['drive_safe', 'dealer', 'direct_customer'];
    if (!allowedContexts.includes(context)) {
      throw new BadRequestException('Invalid context');
    }

    if (context === 'drive_safe') {
      const hasTierPrice =
        (price12Months !== undefined && price12Months >= 0) ||
        (price24Months !== undefined && price24Months >= 0) ||
        (price36Months !== undefined && price36Months >= 0);

      if ((price === undefined || price < 0) && !hasTierPrice) {
        throw new BadRequestException(
          'At least one valid price must be provided for drive_safe context',
        );
      }
    }

    const normalizedDurationUnit =
      durationUnit === 'years' ? 'years' : 'months';
    const durationVal = durationValue || 12;
    const coverageDurationMonths =
      normalizedDurationUnit === 'years' ? durationVal * 12 : durationVal;

    // Create the package
    const pkg = await this.prisma.warrantyPackage.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        planLevel: planLevel?.trim() || null,
        eligibility: eligibility?.trim() || null,
        excess: excess ?? null,
        labourRatePerHour: labourRatePerHour ?? null,
        fixedClaimLimit: fixedClaimLimit ?? null,
        price12Months: price12Months ?? null,
        price24Months: price24Months ?? null,
        price36Months: price36Months ?? null,
        coverageDuration: coverageDurationMonths,
        durationValue: durationVal,
        durationUnit: normalizedDurationUnit,
        context,
        price: price ?? null,
        status: 'active',
        createdById: userId || null,
      },
    });

    // Create relations for keyBenefits
    if (Array.isArray(keyBenefits) && keyBenefits.length > 0) {
      await this.createPackageItems(pkg.id, keyBenefits, 'benefit');
    }

    // Create relations for includedFeatures
    if (Array.isArray(includedFeatures) && includedFeatures.length > 0) {
      await this.createPackageItems(pkg.id, includedFeatures, 'feature');
    }

    await this.activityLog.log({
      userId,
      action: 'create',
      module: 'warranty-packages',
      entity: 'WarrantyPackage',
      entityId: pkg.id,
      description: `Created warranty package: ${pkg.name}`,
      newValues: pkg,
    });

    return pkg;
  }

  /**
   * Get all warranty packages
   */
  async findAll(context?: string, dealerId?: string): Promise<any[]> {
    const where: any = {};
    if (context) {
      where.context = context;
    }

    const client = dealerId
      ? await this.tenantDb.getTenantPrismaByDealerId(dealerId)
      : this.prisma;

    return client.warrantyPackage.findMany({
      where,
      include: {
        items: {
          include: {
            warrantyItem: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get warranty package by ID (supports tenant DB)
   */
  async findOne(id: string, dealerId?: string): Promise<any> {
    let client = this.prisma;

    if (dealerId) {
      client = await this.tenantDb.getTenantPrismaByDealerId(dealerId);
    }

    const pkg = await client.warrantyPackage.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            warrantyItem: true,
          },
        },
      },
    });

    if (!pkg) {
      throw new NotFoundException('Warranty package not found');
    }

    return pkg;
  }

  /**
   * Update warranty package
   */
  async update(
    id: string,
    dto: UpdateWarrantyPackageDto,
    userId: string,
  ): Promise<any> {
    const existing = await this.prisma.warrantyPackage.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Warranty package not found');
    }

    const {
      name,
      description,
      planLevel,
      eligibility,
      excess,
      labourRatePerHour,
      fixedClaimLimit,
      price12Months,
      price24Months,
      price36Months,
      durationValue,
      durationUnit,
      context,
      price,
      status,
      keyBenefits,
      includedFeatures,
    } = dto;

    let normalizedUnit = existing.durationUnit;
    if (durationUnit) {
      normalizedUnit = durationUnit === 'years' ? 'years' : 'months';
    }
    const durationVal = durationValue ?? existing.durationValue;
    const coverageDurationMonths =
      normalizedUnit === 'years' ? durationVal * 12 : durationVal;

    const updated = await this.prisma.warrantyPackage.update({
      where: { id },
      data: {
        name: name !== undefined ? name.trim() : existing.name,
        description:
          description !== undefined
            ? description?.trim() || null
            : existing.description,
        planLevel:
          planLevel !== undefined
            ? planLevel?.trim() || null
            : existing.planLevel,
        eligibility:
          eligibility !== undefined
            ? eligibility?.trim() || null
            : existing.eligibility,
        excess: excess ?? existing.excess,
        labourRatePerHour: labourRatePerHour ?? existing.labourRatePerHour,
        fixedClaimLimit: fixedClaimLimit ?? existing.fixedClaimLimit,
        price12Months: price12Months ?? existing.price12Months,
        price24Months: price24Months ?? existing.price24Months,
        price36Months: price36Months ?? existing.price36Months,
        durationValue: durationVal,
        durationUnit: normalizedUnit,
        coverageDuration: coverageDurationMonths,
        context: context ?? existing.context,
        price: price ?? existing.price,
        status: status ?? existing.status,
      },
    });

    // Update keyBenefits if provided
    if (keyBenefits !== undefined && Array.isArray(keyBenefits)) {
      await this.prisma.warrantyPackageItem.deleteMany({
        where: { warrantyPackageId: id, type: 'benefit' },
      });
      await this.createPackageItems(id, keyBenefits, 'benefit');
    }

    // Update includedFeatures if provided
    if (includedFeatures !== undefined && Array.isArray(includedFeatures)) {
      await this.prisma.warrantyPackageItem.deleteMany({
        where: { warrantyPackageId: id, type: 'feature' },
      });
      await this.createPackageItems(id, includedFeatures, 'feature');
    }

    return updated;
  }

  /**
   * Delete warranty package from master and all tenant DBs
   */
  async delete(id: string, userId: string): Promise<void> {
    const existing = await this.prisma.warrantyPackage.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Warranty package not found');
    }

    // Delete from all tenant databases
    const tenants = await this.prisma.dealer.findMany({
      select: { id: true },
    });

    for (const tenant of tenants) {
      try {
        const tenantPrisma = await this.tenantDb.getTenantPrismaByDealerId(
          tenant.id,
        );
        await tenantPrisma.warrantyPackage.deleteMany({
          where: { id },
        });
      } catch (err) {
        this.logger.warn(
          `Failed to delete package ${id} from tenant ${tenant.id}: ${err.message}`,
        );
      }
    }

    // Delete from master
    await this.prisma.warrantyPackage.delete({ where: { id } });

    await this.activityLog.log({
      userId,
      action: 'delete',
      module: 'warranty-packages',
      entity: 'WarrantyPackage',
      entityId: id,
      description: `Deleted warranty package: ${existing.name}`,
      oldValues: existing,
    });
  }

  /**
   * Assign warranty package to dealer
   */
  async assignToDealer(
    dto: AssignPackageToDealerDto,
    userId: string,
  ): Promise<any> {
    const {
      dealerId,
      warrantyPackageId,
      duration,
      excess,
      labourRatePerHour,
      fixedClaimLimit,
      dealerPrice12Months,
      dealerPrice24Months,
      dealerPrice36Months,
    } = dto;

    // Get dealer
    const dealer = await this.prisma.dealer.findUnique({
      where: { id: dealerId },
      select: {
        id: true,
        businessNameLegal: true,
        businessNameTrading: true,
      },
    });

    if (!dealer) {
      throw new NotFoundException('Dealer not found');
    }

    // Get master package
    const masterPkg = await this.prisma.warrantyPackage.findUnique({
      where: { id: warrantyPackageId },
    });

    if (!masterPkg) {
      throw new NotFoundException('Warranty package not found');
    }

    // Get tenant Prisma client
    const tenantPrisma =
      await this.tenantDb.getTenantPrismaByDealerId(dealerId);

    // Get master package items
    const masterPackageItems = await this.prisma.warrantyPackageItem.findMany({
      where: { warrantyPackageId: masterPkg.id },
      include: { warrantyItem: true },
    });

    // Upsert package in tenant DB
    const tenantPkg = await tenantPrisma.warrantyPackage.upsert({
      where: { id: masterPkg.id },
      update: {
        name: masterPkg.name,
        description: masterPkg.description,
        planLevel: masterPkg.planLevel,
        eligibility: masterPkg.eligibility,
        excess: excess ?? masterPkg.excess,
        labourRatePerHour: labourRatePerHour ?? masterPkg.labourRatePerHour,
        fixedClaimLimit: fixedClaimLimit ?? masterPkg.fixedClaimLimit,
        price12Months: masterPkg.price12Months,
        price24Months: masterPkg.price24Months,
        price36Months: masterPkg.price36Months,
        dealerPrice12Months: dealerPrice12Months ?? null,
        dealerPrice24Months: dealerPrice24Months ?? null,
        dealerPrice36Months: dealerPrice36Months ?? null,
        coverageDuration: masterPkg.coverageDuration,
        durationValue: masterPkg.durationValue,
        durationUnit: masterPkg.durationUnit,
        context: 'dealer',
        price: masterPkg.price,
        status: masterPkg.status,
      },
      create: {
        id: masterPkg.id,
        name: masterPkg.name,
        description: masterPkg.description,
        planLevel: masterPkg.planLevel,
        eligibility: masterPkg.eligibility,
        excess: excess ?? masterPkg.excess,
        labourRatePerHour: labourRatePerHour ?? masterPkg.labourRatePerHour,
        fixedClaimLimit: fixedClaimLimit ?? masterPkg.fixedClaimLimit,
        price12Months: masterPkg.price12Months,
        price24Months: masterPkg.price24Months,
        price36Months: masterPkg.price36Months,
        dealerPrice12Months: dealerPrice12Months ?? null,
        dealerPrice24Months: dealerPrice24Months ?? null,
        dealerPrice36Months: dealerPrice36Months ?? null,
        coverageDuration: masterPkg.coverageDuration,
        durationValue: masterPkg.durationValue,
        durationUnit: masterPkg.durationUnit,
        context: 'dealer',
        price: masterPkg.price,
        status: masterPkg.status,
        createdById: userId,
      },
    });

    // Copy package items to tenant
    if (masterPackageItems.length > 0) {
      await tenantPrisma.warrantyPackageItem.deleteMany({
        where: { warrantyPackageId: tenantPkg.id },
      });

      for (const pkgItem of masterPackageItems) {
        // Ensure WarrantyItem exists in tenant
        await tenantPrisma.warrantyItem.upsert({
          where: { id: pkgItem.warrantyItem.id },
          update: {
            label: pkgItem.warrantyItem.label,
            type: pkgItem.warrantyItem.type,
            status: pkgItem.warrantyItem.status,
          },
          create: {
            id: pkgItem.warrantyItem.id,
            label: pkgItem.warrantyItem.label,
            type: pkgItem.warrantyItem.type,
            status: pkgItem.warrantyItem.status,
          },
        });
      }

      await tenantPrisma.warrantyPackageItem.createMany({
        data: masterPackageItems.map((item) => ({
          warrantyPackageId: tenantPkg.id,
          warrantyItemId: item.warrantyItemId,
          type: item.type,
        })),
        skipDuplicates: true,
      });
    }

    // Create warranty sale record in master
    const now = new Date();
    const durationMonths = duration || masterPkg.coverageDuration || 12;
    const coverageEndDate = new Date(now);
    coverageEndDate.setMonth(coverageEndDate.getMonth() + durationMonths);

    const warrantyPrice =
      durationMonths === 12
        ? Number(masterPkg.price12Months) || 0
        : durationMonths === 24
          ? Number(masterPkg.price24Months) || 0
          : Number(masterPkg.price36Months) || Number(masterPkg.price) || 0;

    const masterSale = await this.prisma.warrantySale.create({
      data: {
        customerId: null,
        dealerId: dealer.id,
        salesRepresentativeName: null,
        warrantyPackageId: masterPkg.id,
        coverageStartDate: now,
        coverageEndDate,
        warrantyPrice,
        excess: excess ?? masterPkg.excess ?? null,
        labourRatePerHour:
          labourRatePerHour ?? masterPkg.labourRatePerHour ?? null,
        fixedClaimLimit: fixedClaimLimit ?? masterPkg.fixedClaimLimit ?? null,
        price12Months: masterPkg.price12Months ?? null,
        price24Months: masterPkg.price24Months ?? null,
        price36Months: masterPkg.price36Months ?? null,
        dealerCost12Months: dealerPrice12Months ?? null,
        dealerCost24Months: dealerPrice24Months ?? null,
        dealerCost36Months: dealerPrice36Months ?? null,
        paymentMethod: 'dealer_assignment',
        saleDate: now,
        policyNumber: `DLR-${dealer.id.slice(0, 6)}-${Date.now()}`,
        status: 'active',
        createdById: userId,
      },
    });

    // Mirror sale in tenant DB
    const tenantSale = await tenantPrisma.warrantySale.create({
      data: {
        id: masterSale.id,
        customerId: null,
        dealerId: dealer.id,
        salesRepresentativeName: null,
        warrantyPackageId: tenantPkg.id,
        coverageStartDate: now,
        coverageEndDate,
        warrantyPrice: masterSale.warrantyPrice,
        excess: excess ?? tenantPkg.excess ?? null,
        labourRatePerHour:
          labourRatePerHour ?? tenantPkg.labourRatePerHour ?? null,
        fixedClaimLimit: fixedClaimLimit ?? tenantPkg.fixedClaimLimit ?? null,
        price12Months: tenantPkg.price12Months ?? null,
        price24Months: tenantPkg.price24Months ?? null,
        price36Months: tenantPkg.price36Months ?? null,
        dealerCost12Months: dealerPrice12Months ?? null,
        dealerCost24Months: dealerPrice24Months ?? null,
        dealerCost36Months: dealerPrice36Months ?? null,
        paymentMethod: 'dealer_assignment',
        saleDate: now,
        policyNumber: masterSale.policyNumber,
        status: 'active',
        createdById: userId,
      },
    });

    // Create invoice record in master for the assignment
    if (warrantyPrice > 0) {
      try {
        const invoiceNumber = `INV-SA-${dealer.id.slice(0, 6).toUpperCase()}-${Date.now()}`;
        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + 30);

        await this.prisma.invoice.create({
          data: {
            id: randomUUID(),
            invoiceNumber,
            warrantySaleId: masterSale.id,
            dealerId: dealer.id,
            amount: warrantyPrice,
            status: 'pending',
            invoiceDate: now,
            dueDate,
            paymentMethod: 'dealer_assignment',
            createdById: userId,
          },
        });
      } catch (invoiceError) {
        this.logger.warn(
          `Failed to create assignment invoice in master: ${invoiceError.message}`,
        );
      }
    }

    await this.activityLog.log({
      userId,
      action: 'assign',
      module: 'warranty-packages',
      entity: 'WarrantyPackage',
      entityId: masterPkg.id,
      description: `Assigned warranty package "${masterPkg.name}" to dealer ${dealer.businessNameTrading || dealer.businessNameLegal}`,
      newValues: {
        dealerId: dealer.id,
        tenantPackageId: tenantPkg.id,
        warrantySaleId: masterSale.id,
      },
    });

    return {
      masterPackage: masterPkg,
      dealerPackage: tenantPkg,
      masterSale,
      tenantSale,
    };
  }

  /**
   * Helper: Create package item relations
   */
  private async createPackageItems(
    packageId: string,
    itemIds: string[],
    type: 'benefit' | 'feature',
  ): Promise<void> {
    const itemsToConnect: {
      warrantyPackageId: string;
      warrantyItemId: string;
      type: string;
    }[] = [];

    for (const itemId of itemIds) {
      const item = await this.prisma.warrantyItem.findUnique({
        where: { id: itemId },
      });

      if (item && item.type === type && item.status === 'active') {
        itemsToConnect.push({
          warrantyPackageId: packageId,
          warrantyItemId: item.id,
          type,
        });
      }
    }

    if (itemsToConnect.length > 0) {
      await this.prisma.warrantyPackageItem.createMany({
        data: itemsToConnect,
        skipDuplicates: true,
      });
    }
  }
}
