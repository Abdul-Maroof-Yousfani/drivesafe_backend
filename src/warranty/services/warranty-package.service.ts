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
  UpdateWarrantyAssignmentDto,
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
      eligibilityMileageComparator,
      eligibilityMileageValue,
      eligibilityVehicleAgeYearsMax,
      eligibilityTransmission,
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

    const mileageComparatorProvided =
      eligibilityMileageComparator !== undefined &&
      eligibilityMileageComparator !== null;
    const mileageValueProvided =
      eligibilityMileageValue !== undefined && eligibilityMileageValue !== null;

    if (mileageComparatorProvided !== mileageValueProvided) {
      throw new BadRequestException(
        'Mileage eligibility requires both comparator and value',
      );
    }

    // Create the package
    const pkg = await this.prisma.warrantyPackage.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        planLevel: planLevel?.trim() || null,
        eligibility: eligibility?.trim() || null,
        eligibilityMileageComparator: mileageComparatorProvided
          ? eligibilityMileageComparator
          : null,
        eligibilityMileageValue: mileageValueProvided
          ? eligibilityMileageValue
          : null,
        eligibilityVehicleAgeYearsMax: eligibilityVehicleAgeYearsMax ?? null,
        eligibilityTransmission: eligibilityTransmission ?? null,
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
  async findAll(
    context?: string,
    dealerId?: string,
    includePresets?: boolean,
    includeInactive?: boolean,
    includeDeleted?: boolean,
  ): Promise<any[]> {
    const where: any = {};
    
    // Default: exclude deleted. If includeDeleted is true, show ALL (deleted or not)
    if (!includeDeleted) {
      where.deletedAt = null;
    }
    
    if (context) {
      where.context = context;
    }
    // If includePresets is false, exclude presets
    if (includePresets === false) {
      where.isPreset = false;
    }
    // If includeInactive is false, only show active
    if (includeInactive === false) {
      where.status = 'active';
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

    const pkg = await client.warrantyPackage.findFirst({
      where: { id, deletedAt: null },
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
      eligibilityMileageComparator,
      eligibilityMileageValue,
      eligibilityVehicleAgeYearsMax,
      eligibilityTransmission,
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

    const nextMileageComparator =
      eligibilityMileageComparator !== undefined
        ? eligibilityMileageComparator
        : existing.eligibilityMileageComparator;
    const nextMileageValue =
      eligibilityMileageValue !== undefined
        ? eligibilityMileageValue
        : existing.eligibilityMileageValue;

    const nextMileageComparatorProvided =
      nextMileageComparator !== undefined && nextMileageComparator !== null;
    const nextMileageValueProvided =
      nextMileageValue !== undefined && nextMileageValue !== null;

    if (nextMileageComparatorProvided !== nextMileageValueProvided) {
      throw new BadRequestException(
        'Mileage eligibility requires both comparator and value',
      );
    }

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
        eligibilityMileageComparator:
          eligibilityMileageComparator !== undefined
            ? eligibilityMileageComparator
            : existing.eligibilityMileageComparator,
        eligibilityMileageValue:
          eligibilityMileageValue !== undefined
            ? eligibilityMileageValue
            : existing.eligibilityMileageValue,
        eligibilityVehicleAgeYearsMax:
          eligibilityVehicleAgeYearsMax !== undefined
            ? eligibilityVehicleAgeYearsMax
            : existing.eligibilityVehicleAgeYearsMax,
        eligibilityTransmission:
          eligibilityTransmission !== undefined
            ? eligibilityTransmission
            : existing.eligibilityTransmission,
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

    // Propagate updates to all tenant (dealer) databases where this package exists
    await this.propagatePackageUpdateToTenants(id, updated, keyBenefits, includedFeatures);

    await this.activityLog.log({
      userId,
      action: 'update',
      module: 'warranty-packages',
      entity: 'WarrantyPackage',
      entityId: id,
      description: `Updated warranty package: ${updated.name}`,
      oldValues: existing,
      newValues: updated,
    });

    return updated;
  }

  /**
   * Propagate package updates to all tenant databases where the package exists
   */
  private async propagatePackageUpdateToTenants(
    packageId: string,
    updated: any,
    keyBenefits?: string[],
    includedFeatures?: string[],
  ): Promise<void> {
    const dealers = await this.prisma.dealer.findMany({
      where: { status: 'active', databaseName: { not: null } },
      select: { id: true, businessNameLegal: true },
    });

    let propagatedCount = 0;

    for (const dealer of dealers) {
      try {
        const tenantPrisma = await this.tenantDb.getTenantPrismaByDealerId(dealer.id);

        // Check if this package exists in the tenant DB
        const existsInTenant = await tenantPrisma.warrantyPackage.findUnique({
          where: { id: packageId },
        });

        if (!existsInTenant) {
          continue; // Package not assigned to this dealer, skip
        }

        // Update the package in tenant DB (preserve dealer-specific prices)
        await tenantPrisma.warrantyPackage.update({
          where: { id: packageId },
          data: {
            name: updated.name,
            description: updated.description,
            planLevel: updated.planLevel,
            eligibility: updated.eligibility,
            eligibilityMileageComparator: updated.eligibilityMileageComparator,
            eligibilityMileageValue: updated.eligibilityMileageValue,
            eligibilityVehicleAgeYearsMax: updated.eligibilityVehicleAgeYearsMax,
            eligibilityTransmission: updated.eligibilityTransmission,
            excess: updated.excess,
            labourRatePerHour: updated.labourRatePerHour,
            fixedClaimLimit: updated.fixedClaimLimit,
            price12Months: updated.price12Months,
            price24Months: updated.price24Months,
            price36Months: updated.price36Months,
            // Note: NOT updating dealerPrice12/24/36Months to preserve dealer-specific costs
            coverageDuration: updated.coverageDuration,
            durationValue: updated.durationValue,
            durationUnit: updated.durationUnit,
            price: updated.price,
            status: updated.status,
          },
        });

        // Sync package items (benefits/features) if they were updated
        if (keyBenefits !== undefined && Array.isArray(keyBenefits)) {
          await tenantPrisma.warrantyPackageItem.deleteMany({
            where: { warrantyPackageId: packageId, type: 'benefit' },
          });
          await this.createTenantPackageItems(tenantPrisma, packageId, keyBenefits, 'benefit');
        }

        if (includedFeatures !== undefined && Array.isArray(includedFeatures)) {
          await tenantPrisma.warrantyPackageItem.deleteMany({
            where: { warrantyPackageId: packageId, type: 'feature' },
          });
          await this.createTenantPackageItems(tenantPrisma, packageId, includedFeatures, 'feature');
        }

        propagatedCount++;
        this.logger.log(`Propagated package ${packageId} to dealer ${dealer.businessNameLegal}`);
      } catch (err) {
        this.logger.warn(
          `Failed to propagate package ${packageId} to tenant ${dealer.id}: ${err.message}`,
        );
      }
    }

    if (propagatedCount > 0) {
      this.logger.log(`Package ${packageId} propagated to ${propagatedCount} dealer(s)`);
    }
  }

  /**
   * Create package items in a tenant database
   */
  private async createTenantPackageItems(
    tenantPrisma: any,
    packageId: string,
    itemIds: string[],
    type: 'benefit' | 'feature',
  ): Promise<void> {
    for (const itemId of itemIds) {
      // Ensure the WarrantyItem exists in tenant DB
      const masterItem = await this.prisma.warrantyItem.findUnique({
        where: { id: itemId },
      });

      if (!masterItem || masterItem.type !== type || masterItem.status !== 'active') {
        continue;
      }

      // Upsert the WarrantyItem in tenant DB
      await tenantPrisma.warrantyItem.upsert({
        where: { id: itemId },
        update: {
          label: masterItem.label,
          type: masterItem.type,
          status: masterItem.status,
        },
        create: {
          id: masterItem.id,
          label: masterItem.label,
          description: masterItem.description,
          type: masterItem.type,
          status: masterItem.status,
        },
      });

      // Create the package item relation
      await tenantPrisma.warrantyPackageItem.upsert({
        where: {
          warrantyPackageId_warrantyItemId_type: {
            warrantyPackageId: packageId,
            warrantyItemId: itemId,
            type,
          },
        },
        update: {},
        create: {
          warrantyPackageId: packageId,
          warrantyItemId: itemId,
          type,
        },
      });
    }
  }

  /**
   * Delete warranty package from master and all tenant DBs
   */
  async delete(id: string, userId: string): Promise<void> {
    const existing = await this.prisma.warrantyPackage.findUnique({
      where: { id },
    });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Warranty package not found');
    }

    const deletedAt = new Date();

    // Soft delete from all tenant databases
    const tenants = await this.prisma.dealer.findMany({
      select: { id: true },
    });

    for (const tenant of tenants) {
      try {
        const tenantPrisma = await this.tenantDb.getTenantPrismaByDealerId(
          tenant.id,
        );
        await tenantPrisma.warrantyPackage.updateMany({
          where: { id },
          data: { deletedAt },
        });
      } catch (err) {
        this.logger.warn(
          `Failed to soft delete package ${id} from tenant ${tenant.id}: ${err.message}`,
        );
      }
    }

    // Soft delete from master
    await this.prisma.warrantyPackage.update({
      where: { id },
      data: { deletedAt },
    });

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
   * Restore soft-deleted warranty package
   */
  async restore(id: string, userId: string): Promise<any> {
    const existing = await this.prisma.warrantyPackage.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Warranty package not found');
    }

    if (!existing.deletedAt) {
      return existing; // Already active
    }

    // Restore in all tenant databases
    const tenants = await this.prisma.dealer.findMany({
      select: { id: true },
    });

    for (const tenant of tenants) {
      try {
        const tenantPrisma = await this.tenantDb.getTenantPrismaByDealerId(
          tenant.id,
        );
        await tenantPrisma.warrantyPackage.updateMany({
          where: { id },
          data: { deletedAt: null },
        });
      } catch (err) {
        this.logger.warn(
          `Failed to restore package ${id} from tenant ${tenant.id}: ${err.message}`,
        );
      }
    }

    // Restore in master
    const restored = await this.prisma.warrantyPackage.update({
      where: { id },
      data: { deletedAt: null },
    });

    await this.activityLog.log({
      userId,
      action: 'restore',
      module: 'warranty-packages',
      entity: 'WarrantyPackage',
      entityId: id,
      description: `Restored warranty package: ${restored.name}`,
    });

    return restored;
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
      includedBenefits,
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

    if (!masterPkg || masterPkg.deletedAt) {
      throw new NotFoundException('Warranty package not found');
    }

    if (masterPkg.status !== 'active') {
      throw new BadRequestException('Cannot assign an inactive warranty package');
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
        eligibilityMileageComparator: masterPkg.eligibilityMileageComparator,
        eligibilityMileageValue: masterPkg.eligibilityMileageValue,
        eligibilityVehicleAgeYearsMax: masterPkg.eligibilityVehicleAgeYearsMax,
        eligibilityTransmission: masterPkg.eligibilityTransmission,
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
        eligibilityMileageComparator: masterPkg.eligibilityMileageComparator,
        eligibilityMileageValue: masterPkg.eligibilityMileageValue,
        eligibilityVehicleAgeYearsMax: masterPkg.eligibilityVehicleAgeYearsMax,
        eligibilityTransmission: masterPkg.eligibilityTransmission,
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

    // Create WarrantyAssignment in Master DB
    const now = new Date();
    const durationMonths = duration || masterPkg.coverageDuration || 12;

    const warrantyPrice =
      durationMonths === 12
        ? Number(masterPkg.price12Months) || 0
        : durationMonths === 24
          ? Number(masterPkg.price24Months) || 0
          : Number(masterPkg.price36Months) || Number(masterPkg.price) || 0;

    const masterAssignment = await this.prisma.warrantyAssignment.create({
      data: {
        dealerId: dealer.id,
        warrantyPackageId: masterPkg.id,
        price: warrantyPrice,
        dealerPrice12Months: dealerPrice12Months ?? null,
        dealerPrice24Months: dealerPrice24Months ?? null,
        dealerPrice36Months: dealerPrice36Months ?? null,
        paymentMethod: 'dealer_assignment',
        assignedAt: now,
        assignedById: userId,
      },
    });

    // Create WarrantyAssignment in Tenant DB
    await tenantPrisma.warrantyAssignment.create({
      data: {
        id: masterAssignment.id,
        dealerId: dealer.id,
        warrantyPackageId: tenantPkg.id,
        price: warrantyPrice,
        dealerPrice12Months: dealerPrice12Months ?? null,
        dealerPrice24Months: dealerPrice24Months ?? null,
        dealerPrice36Months: dealerPrice36Months ?? null,
        paymentMethod: 'dealer_assignment',
        assignedAt: now,
        assignedById: userId,
      },
    });

    // Snapshot selected benefits for this assignment (use explicit list or all package benefits)
    // This logic is no longer needed as benefits are not directly tied to assignments in the same way as sales.
    // The package items themselves define the benefits.

    // Invoice record creation for assignment removed per user request
    /*
    if (warrantyPrice > 0) {
      try {
        const invoiceNumber = `INV-SA-${dealer.id.slice(0, 6).toUpperCase()}-${Date.now()}`;
        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + 30);

        await this.prisma.invoice.create({
          data: {
            id: randomUUID(),
            invoiceNumber,
            warrantyAssignmentId: masterAssignment.id, // Link to assignment, not sale
            dealerId: dealer.id,
            amount: warrantyPrice,
            status: 'pending',
            invoiceDate: now,
            dueDate,
            createdById: userId,
          },
        });
      } catch (err) {
        this.logger.error(`Failed to create invoice for assignment: ${err.message}`);
        // Consider whether to rollback here, but for now just log
      }
    }
    */

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
        warrantyAssignmentId: masterAssignment.id,
      },
    });

    return {
      masterPackage: masterPkg,
      dealerPackage: tenantPkg,
      masterAssignment,
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

  /**
   * Helper: snapshot benefits for dealer assignment sales
   */
  private async syncSaleBenefitsForAssignment(
    client: any,
    saleId: string,
    benefitIds: string[],
  ): Promise<void> {
    if (!benefitIds.length) return;

    await client.warrantySaleBenefit.deleteMany({
      where: { warrantySaleId: saleId },
    });

    const items = await client.warrantyItem.findMany({
      where: {
        id: { in: benefitIds },
        status: 'active',
      },
      select: { id: true, label: true, type: true },
    });

    if (!items.length) return;

    await client.warrantySaleBenefit.createMany({
      data: items.map((item) => ({
        warrantySaleId: saleId,
        warrantyItemId: item.id,
        label: item.label,
        type: item.type || 'benefit',
      })),
      skipDuplicates: true,
    });
  }
  /**
   * Get all warranty assignments
   */
  async findAllAssignments(dealerId?: string): Promise<any[]> {
    const where: any = {};
    if (dealerId) {
      where.dealerId = dealerId;
    }

    return this.prisma.warrantyAssignment.findMany({
      where,
      include: {
        dealer: {
            select: {
                id: true,
                businessNameLegal: true,
                businessNameTrading: true,
                email: true,
                phone: true,
            }
        },
        warrantyPackage: true,
      },
      orderBy: { assignedAt: 'desc' },
    });
  }

  /**
   * Get single warranty assignment by ID
   */
  async findOneAssignment(id: string): Promise<any> {
    const assignment = await this.prisma.warrantyAssignment.findUnique({
      where: { id },
      include: {
        dealer: {
            select: {
                id: true,
                businessNameLegal: true,
                businessNameTrading: true,
                email: true,
                phone: true,
                businessAddress: true,
            }
        },
        warrantyPackage: {
            include: {
                items: {
                    include: {
                        warrantyItem: true
                    }
                }
            }
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Warranty assignment not found');
    }

    return assignment;
  }

  async updateAssignment(id: string, dto: UpdateWarrantyAssignmentDto) {
    const assignment = await this.prisma.warrantyAssignment.findUnique({
      where: { id },
    });

    if (!assignment) {
      throw new NotFoundException('Warranty assignment not found');
    }

    const updateData: any = {};
    if (dto.dealerPrice12Months !== undefined)
      updateData.dealerPrice12Months = dto.dealerPrice12Months;
    if (dto.dealerPrice24Months !== undefined)
      updateData.dealerPrice24Months = dto.dealerPrice24Months;
    if (dto.dealerPrice36Months !== undefined)
      updateData.dealerPrice36Months = dto.dealerPrice36Months;
    if (dto.price !== undefined) updateData.price = dto.price;

    const updatedAssignment = await this.prisma.warrantyAssignment.update({
      where: { id },
      data: updateData,
    });

    // Sync to tenant
    const tenantPrisma = await this.tenantDb.getTenantPrismaByDealerId(
      assignment.dealerId,
    );

    // Update tenant assignment
    await tenantPrisma.warrantyAssignment.update({
      where: { id },
      data: updateData,
    });

    // Update tenant package dealer prices
    await tenantPrisma.warrantyPackage.update({
      where: { id: assignment.warrantyPackageId },
      data: {
        dealerPrice12Months:
          dto.dealerPrice12Months !== undefined
            ? dto.dealerPrice12Months
            : undefined,
        dealerPrice24Months:
          dto.dealerPrice24Months !== undefined
            ? dto.dealerPrice24Months
            : undefined,
        dealerPrice36Months:
          dto.dealerPrice36Months !== undefined
            ? dto.dealerPrice36Months
            : undefined,
      },
    });

    return updatedAssignment;
  }
}
