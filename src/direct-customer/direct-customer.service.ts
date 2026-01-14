import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { DirectPurchaseDto, EligiblePackagesDto } from './dto';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { ActivityLogService } from '../common/services/activity-log.service';

@Injectable()
export class DirectCustomerService {
  private readonly logger = new Logger(DirectCustomerService.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private activityLog: ActivityLogService,
  ) {}

  /**
   * Generate a random 8-character alphanumeric password
   */
  private generateRandomPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /**
   * Get warranty packages available for direct customers based on vehicle eligibility
   */
  async getAvailablePackages(dto: EligiblePackagesDto): Promise<any[]> {
    const currentYear = new Date().getFullYear();
    const vehicleAge = currentYear - dto.year;

    const packages = await this.prisma.warrantyPackage.findMany({
      where: {
        status: 'active',
        // We fetch all and filter in memory for complex age/mileage logic
        // OR we could pre-filter some basic stuff
      },
      include: {
        items: {
          include: {
            warrantyItem: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filter packages based on eligibility
    const eligiblePackages = packages.filter((pkg) => {
      // 1. Check vehicle age
      if (pkg.eligibilityVehicleAgeYearsMax !== null && pkg.eligibilityVehicleAgeYearsMax !== undefined) {
        if (vehicleAge > pkg.eligibilityVehicleAgeYearsMax) {
          return false;
        }
      }

      // 2. Check mileage
      if (pkg.eligibilityMileageValue !== null && pkg.eligibilityMileageValue !== undefined) {
        const comparator = pkg.eligibilityMileageComparator?.toLowerCase() || '<=';
        if (comparator === '<=' || comparator === 'less than or equal to') {
          if (dto.mileage > pkg.eligibilityMileageValue) return false;
        } else if (comparator === '<' || comparator === 'less than') {
          if (dto.mileage >= pkg.eligibilityMileageValue) return false;
        }
      }

      // 3. Check transmission
      if (pkg.eligibilityTransmission && dto.transmission) {
        if (pkg.eligibilityTransmission.toLowerCase() !== dto.transmission.toLowerCase()) {
          return false;
        }
      }

      return true;
    });

    return eligiblePackages.slice(0, 6);
  }

  /**
   * Complete a direct customer purchase
   */
  async completePurchase(dto: DirectPurchaseDto): Promise<{
    success: boolean;
    customer: any;
    vehicle: any;
    warrantySale: any;
    invoice: any;
    temporaryPassword: string;
  }> {
    const { vehicle, customer, warrantyPackageId, duration } = dto;

    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: customer.email },
    });

    if (existingUser) {
      throw new ConflictException(
        'An account with this email already exists. Please login or use a different email.',
      );
    }

    // Also check customer table
    const existingCustomer = await this.prisma.customer.findFirst({
      where: { email: customer.email },
    });

    if (existingCustomer) {
      throw new ConflictException(
        'A customer with this email already exists.',
      );
    }

    // Get warranty package
    const warrantyPackage = await this.prisma.warrantyPackage.findUnique({
      where: { id: warrantyPackageId },
      include: {
        items: {
          include: {
            warrantyItem: true,
          },
        },
      },
    });

    if (!warrantyPackage) {
      throw new NotFoundException('Warranty package not found');
    }

    // Calculate price based on duration
    let warrantyPrice: number;
    switch (duration) {
      case 12:
        warrantyPrice = Number(warrantyPackage.price12Months) || 0;
        break;
      case 24:
        warrantyPrice = Number(warrantyPackage.price24Months) || 0;
        break;
      case 36:
        warrantyPrice = Number(warrantyPackage.price36Months) || Number(warrantyPackage.price) || 0;
        break;
      default:
        warrantyPrice = Number(warrantyPackage.price) || 0;
    }

    if (warrantyPrice <= 0) {
      throw new BadRequestException('Invalid price for selected duration');
    }

    // Generate password and hash it
    const temporaryPassword = this.generateRandomPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    // Get customer role
    const customerRole = await this.prisma.role.findFirst({
      where: { name: 'customer' },
    });

    // Start transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create User with role relation
      const user = await tx.user.create({
        data: {
          email: customer.email,
          password: hashedPassword,
          firstName: customer.firstName,
          lastName: customer.lastName,
          phone: customer.phone,
          status: 'active',
          mustChangePassword: true,
          roleId: customerRole?.id || null,
        },
      });

      // 2. Create Customer
      const newCustomer = await tx.customer.create({
        data: {
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          address: customer.address,
          dealerId: null, // Direct customer - no dealer
          status: 'active',
          createdById: user.id,
        },
      });

      // 3. Create CustomerVehicle
      const newVehicle = await tx.customerVehicle.create({
        data: {
          customerId: newCustomer.id,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          vin: vehicle.vin || null,
          registrationNumber: vehicle.registrationNumber || null,
          mileage: vehicle.mileage,
          transmission: vehicle.transmission || null,
          status: 'active',
        },
      });

      // 4. Calculate coverage dates
      const now = new Date();
      const coverageEndDate = new Date(now);
      coverageEndDate.setMonth(coverageEndDate.getMonth() + duration);

      // 5. Generate policy number
      const policyNumber = `DS-${newCustomer.id.slice(0, 6).toUpperCase()}-${Date.now()}`;

      // 6. Create Warranty Sale
      const warrantySale = await tx.warrantySale.create({
        data: {
          customerId: newCustomer.id,
          vehicleId: newVehicle.id,
          dealerId: null, // Direct customer - no dealer
          warrantyPackageId: warrantyPackage.id,
          coverageStartDate: now,
          coverageEndDate,
          warrantyPrice,
          price12Months: warrantyPackage.price12Months,
          price24Months: warrantyPackage.price24Months,
          price36Months: warrantyPackage.price36Months,
          excess: warrantyPackage.excess,
          labourRatePerHour: warrantyPackage.labourRatePerHour,
          fixedClaimLimit: warrantyPackage.fixedClaimLimit,
          paymentMethod: 'direct_purchase',
          saleDate: now,
          policyNumber,
          status: 'active',
          createdById: user.id,
        },
      });

      // 7. Snapshot benefits for this sale
      const benefitItems = warrantyPackage.items?.filter(
        (item) => item.type === 'benefit',
      ) || [];

      if (benefitItems.length > 0) {
        await tx.warrantySaleBenefit.createMany({
          data: benefitItems.map((item) => ({
            warrantySaleId: warrantySale.id,
            warrantyItemId: item.warrantyItemId,
            type: 'benefit',
          })),
          skipDuplicates: true,
        });
      }

      // 8. Create Invoice
      const invoiceNumber = `INV-DS-${newCustomer.id.slice(0, 6).toUpperCase()}-${Date.now()}`;
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + 30);

      const invoice = await tx.invoice.create({
        data: {
          id: randomUUID(),
          invoiceNumber,
          warrantySaleId: warrantySale.id,
          dealerId: null,
          amount: warrantyPrice,
          status: 'paid', // Direct purchase is immediately paid
          invoiceDate: now,
          dueDate,
          paidDate: now,
          paymentMethod: 'direct_purchase',
          createdById: user.id,
        },
      });

      return {
        user,
        customer: newCustomer,
        vehicle: newVehicle,
        warrantySale,
        invoice,
      };
    });

    // Send welcome email with credentials (outside transaction)
    try {
      await this.mailService.sendWelcomeEmail(
        customer.email,
        customer.firstName,
        temporaryPassword,
      );

      await this.mailService.sendPurchaseConfirmationEmail(
        customer.email,
        customer.firstName,
        {
          packageName: warrantyPackage.name,
          policyNumber: result.warrantySale.policyNumber,
          vehicleMake: vehicle.make,
          vehicleModel: vehicle.model,
          vehicleYear: vehicle.year,
          coverageStartDate: result.warrantySale.coverageStartDate,
          coverageEndDate: result.warrantySale.coverageEndDate,
          totalAmount: warrantyPrice,
        },
      );
    } catch (emailError) {
      this.logger.warn(`Failed to send emails: ${emailError.message}`);
      // Continue despite email failure - the purchase was successful
    }

    await this.activityLog.log({
      userId: result.user.id,
      action: 'create',
      module: 'direct-purchases',
      entity: 'WarrantySale',
      entityId: result.warrantySale.id,
      description: `Direct purchase completed for ${customer.email}, policy: ${result.warrantySale.policyNumber}`,
      newValues: result,
    });

    this.logger.log(
      `Direct purchase completed for ${customer.email}, policy: ${result.warrantySale.policyNumber}`,
    );

    return {
      success: true,
      customer: result.customer,
      vehicle: result.vehicle,
      warrantySale: result.warrantySale,
      invoice: result.invoice,
      temporaryPassword, // Return for display in success popup
    };
  }
}
