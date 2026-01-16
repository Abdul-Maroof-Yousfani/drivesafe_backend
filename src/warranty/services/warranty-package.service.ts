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
  ): Promise<any[]> {
    const where: any = {};
    if (context) {
      where.context = context;
    }
    // If includePresets is false, exclude presets
    if (includePresets === false) {
      where.isPreset = false;
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
        // Snapshot package info for immutability
        packageName: masterPkg.name,
        planLevel: masterPkg.planLevel || null,
        packageDescription: masterPkg.description || null,
        packageEligibility: masterPkg.eligibility || null,
        planMonths: durationMonths,
        dealerName: dealer.businessNameLegal,
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
        // Snapshot package info for immutability
        packageName: tenantPkg.name,
        planLevel: tenantPkg.planLevel || null,
        packageDescription: tenantPkg.description || null,
        packageEligibility: tenantPkg.eligibility || null,
        planMonths: durationMonths,
        dealerName: dealer.businessNameLegal,
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

    // Snapshot selected benefits for this assignment (use explicit list or all package benefits)
    const benefitIdsToUse =
      Array.isArray(includedBenefits) && includedBenefits.length > 0
        ? includedBenefits
        : masterPackageItems
            .filter((item) => item.type === 'benefit')
            .map((item) => item.warrantyItemId);

    if (benefitIdsToUse.length > 0) {
      await this.syncSaleBenefitsForAssignment(
        this.prisma,
        masterSale.id,
        benefitIdsToUse,
      );
      await this.syncSaleBenefitsForAssignment(
        tenantPrisma,
        tenantSale.id,
        benefitIdsToUse,
      );
    }

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
}
