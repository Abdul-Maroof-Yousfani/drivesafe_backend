import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaClient as TenantClient } from '@prisma/tenant-client';
import * as bcrypt from 'bcrypt';
import { TenantDatabaseService } from '../common/services/tenant-database.service';

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private tenantDb: TenantDatabaseService,
  ) {}

  async create(createCustomerDto: CreateCustomerDto, user: any) {
    const { email, password, vehicles, ...customerData } = createCustomerDto;

    // 1. Create User in Master DB (Login)
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    const saltRounds = parseInt(
      this.configService.get('PASSWORD_SALT_ROUNDS') || '10',
    );
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    let customerRole = await this.prisma.role.findUnique({
      where: { name: 'customer' },
    });
    if (!customerRole) {
      // Create if not exists
      customerRole = await this.prisma.role.create({
        data: {
          name: 'customer',
          description: 'Customer role',
          isSystem: true,
        },
      });
    }

    await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName: customerData.firstName,
        lastName: customerData.lastName,
        phone: customerData.phone,
        roleId: customerRole.id,
        status: 'active',
      },
    });

    // 2. Create Customer in Appropriate DB
    return this.runInTenantContext(user, async (prisma) => {
      // Check if customer email exists in context
      const existingCustomer = await prisma.customer.findFirst({
        where: { email },
      });
      if (existingCustomer) {
        throw new BadRequestException(
          'Customer profile with this email already exists in this context',
        );
      }

      const customer = await prisma.customer.create({
        data: {
          ...customerData,
          email,
          createdById: user.userId,
          // Assign dealerId if creator is a dealer, otherwise null (Master DB direct customer)
          dealerId:
            user.role === 'dealer' ? user.tenantId || user.userId : null,
          vehicles: {
            create: vehicles?.map((v) => ({
              ...v,
              year: Number(v.year),
            })),
          },
        },
        include: { vehicles: true },
      });

      return customer;
    });
  }

  async findAll(
    params: { page: number; limit: number; search?: string },
    user: any,
  ) {
    const { page, limit, search } = params;
    const skip = (page - 1) * limit;

    return this.runInTenantContext(user, async (prisma) => {
      const where: any = {};
      if (search) {
        where.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [customers, total] = await Promise.all([
        prisma.customer.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: { vehicles: true },
        }),
        prisma.customer.count({ where }),
      ]);

      return {
        data: customers,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    });
  }

  async findOne(id: string, user: any) {
    return this.runInTenantContext(user, async (prisma) => {
      const isMasterDb = ['admin', 'super_admin'].includes(user.role);

      const customer = await prisma.customer.findUnique({
        where: { id },
        include: {
          vehicles: true,
          ...(isMasterDb
            ? {
                createdBy: { select: { firstName: true, lastName: true } },
                dealer: {
                  select: {
                    businessNameLegal: true,
                    businessNameTrading: true,
                  },
                },
                warrantySales: {
                  where: { status: 'active' },
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  include: {
                    warrantyPackage: {
                      select: { id: true, name: true, planLevel: true },
                    },
                    vehicle: {
                      select: {
                        id: true,
                        make: true,
                        model: true,
                        year: true,
                      },
                    },
                    dealer: {
                      select: {
                        id: true,
                        businessNameTrading: true,
                        businessNameLegal: true,
                      },
                    },
                  },
                },
              }
            : {}),
        },
      });

      if (!customer) throw new NotFoundException('Customer not found');

      // Format the response for frontend compatibility
      const formattedCustomer: any = {
        ...customer,
        createdBy: customer.createdBy
          ? `${customer.createdBy.firstName} ${customer.createdBy.lastName}`
          : null,
        dealerName: customer.dealer
          ? customer.dealer.businessNameTrading ||
            customer.dealer.businessNameLegal
          : null,
        dealer: undefined,
      };

      // Format current warranty if exists
      if (customer.warrantySales && customer.warrantySales.length > 0) {
        const activeWarranty = customer.warrantySales[0];

        // Calculate plan months from dates if not explicitly stored
        let planMonths = 12; // default
        if (
          activeWarranty.coverageStartDate &&
          activeWarranty.coverageEndDate
        ) {
          const start = new Date(activeWarranty.coverageStartDate);
          const end = new Date(activeWarranty.coverageEndDate);
          planMonths =
            (end.getFullYear() - start.getFullYear()) * 12 +
            (end.getMonth() - start.getMonth());
        }

        formattedCustomer.currentWarranty = {
          id: activeWarranty.id,
          policyNumber: activeWarranty.policyNumber,
          status: activeWarranty.status,
          coverageStartDate: activeWarranty.coverageStartDate,
          coverageEndDate: activeWarranty.coverageEndDate,
          planMonths: planMonths,
          warrantyPackage: {
            id: activeWarranty.warrantyPackage.id,
            name: activeWarranty.warrantyPackage.name,
            planLevel: activeWarranty.warrantyPackage.planLevel,
          },
          vehicle: activeWarranty.vehicle
            ? {
                make: activeWarranty.vehicle.make,
                model: activeWarranty.vehicle.model,
                year: activeWarranty.vehicle.year,
              }
            : null,
          dealerName: activeWarranty.dealer
            ? activeWarranty.dealer.businessNameTrading ||
              activeWarranty.dealer.businessNameLegal
            : null,
        };
      } else {
        formattedCustomer.currentWarranty = null;
      }

      // Remove raw warrantySales from response
      formattedCustomer.warrantySales = undefined;

      return formattedCustomer;
    });
  }

  async update(id: string, updateData: any, user: any) {
    return this.runInTenantContext(user, async (prisma) => {
      const exists = await prisma.customer.findUnique({ where: { id } });
      if (!exists) throw new NotFoundException('Customer not found');

      return prisma.customer.update({
        where: { id },
        data: updateData,
        include: { vehicles: true },
      });
    });
  }

  async remove(id: string, user: any) {
    return this.runInTenantContext(user, async (prisma) => {
      const exists = await prisma.customer.findUnique({ where: { id } });
      if (!exists) throw new NotFoundException('Customer not found');

      await prisma.customer.delete({ where: { id } });
      return { message: 'Customer deleted successfully' };
    });
  }

  async addVehicle(
    customerId: string,
    createVehicleDto: CreateVehicleDto,
    user: any,
  ) {
    return this.runInTenantContext(user, async (prisma) => {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
      });
      if (!customer) throw new NotFoundException('Customer not found');

      // Super Admin can only add vehicles to non-dealer customers
      if (
        ['admin', 'super_admin'].includes(user.role) &&
        customer.dealerId !== null
      ) {
        throw new BadRequestException(
          'Permission denied: Super Admin can only add vehicles to non-dealer customers',
        );
      }

      return prisma.customerVehicle.create({
        data: {
          ...createVehicleDto,
          customerId,
          year: Number(createVehicleDto.year),
        },
      });
    });
  }

  async updateVehicle(
    vehicleId: string,
    updateVehicleDto: UpdateVehicleDto,
    user: any,
  ) {
    return this.runInTenantContext(user, async (prisma) => {
      const existing = await prisma.customerVehicle.findUnique({
        where: { id: vehicleId },
        include: { customer: true },
      });

      if (!existing) throw new NotFoundException('Vehicle not found');

      // Super Admin can only update vehicles of non-dealer customers
      if (
        ['admin', 'super_admin'].includes(user.role) &&
        existing.customer?.dealerId !== null
      ) {
        throw new BadRequestException(
          'Permission denied: Super Admin can only update vehicles of non-dealer customers',
        );
      }

      const updateData: any = {};
      if (updateVehicleDto.make !== undefined)
        updateData.make = updateVehicleDto.make.trim();
      if (updateVehicleDto.model !== undefined)
        updateData.model = updateVehicleDto.model.trim();
      if (updateVehicleDto.year !== undefined)
        updateData.year = Number(updateVehicleDto.year);
      if (updateVehicleDto.vin !== undefined)
        updateData.vin = updateVehicleDto.vin
          ? updateVehicleDto.vin.trim()
          : null;
      if (updateVehicleDto.registrationNumber !== undefined) {
        updateData.registrationNumber = updateVehicleDto.registrationNumber
          ? updateVehicleDto.registrationNumber.trim()
          : null;
      }
      if (updateVehicleDto.mileage !== undefined)
        updateData.mileage = Number(updateVehicleDto.mileage);

      if (Object.keys(updateData).length === 0) {
        throw new BadRequestException('No fields to update');
      }

      return prisma.customerVehicle.update({
        where: { id: vehicleId },
        data: updateData,
      });
    });
  }

  async deleteVehicle(vehicleId: string, user: any) {
    return this.runInTenantContext(user, async (prisma) => {
      const existing = await prisma.customerVehicle.findUnique({
        where: { id: vehicleId },
        include: { customer: true },
      });

      if (!existing) throw new NotFoundException('Vehicle not found');

      // Super Admin can only delete vehicles of non-dealer customers
      if (
        ['admin', 'super_admin'].includes(user.role) &&
        existing.customer?.dealerId !== null
      ) {
        throw new BadRequestException(
          'Permission denied: Super Admin can only delete vehicles of non-dealer customers',
        );
      }

      try {
        await prisma.customerVehicle.delete({ where: { id: vehicleId } });
        return { message: 'Vehicle deleted successfully' };
      } catch (error: any) {
        if (error.code === 'P2003') {
          throw new BadRequestException(
            'Cannot delete vehicle associated with active warranties',
          );
        }
        throw error;
      }
    });
  }

  // --- Helpers ---

  private async runInTenantContext<T>(
    user: any,
    fn: (prisma: TenantClient | PrismaClient | any) => Promise<T>,
  ): Promise<T> {
    // If Admin/SuperAdmin, use Master DB
    if (['admin', 'super_admin'].includes(user.role)) {
      return fn(this.prisma);
    }

    // If Dealer, connect to Tenant DB
    if (user.role === 'dealer') {
      const tenantId = user.tenantId || user.userId;
      const tenantClient =
        await this.tenantDb.getTenantPrismaByDealerId(tenantId);
      return fn(tenantClient);
    }

    throw new BadRequestException('Invalid role for context switching');
  }
}
