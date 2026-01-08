import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { CreateDealerDto } from './dto/create-dealer.dto';
import { UpdateDealerDto } from './dto/update-dealer.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { Pool } from 'pg';
import { TenantDatabaseService } from '../common/services/tenant-database.service';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

@Injectable()
export class DealerService {
  private readonly logger = new Logger(DealerService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private tenantDb: TenantDatabaseService,
  ) {}

  async create(createDealerDto: CreateDealerDto, createdById: string) {
    const { email, password } = createDealerDto;

    // 1. Check if dealer with email already exists
    const existingDealer = await this.prisma.dealer.findUnique({
      where: { email },
    });
    if (existingDealer) {
      throw new BadRequestException('Dealer with this email already exists');
    }

    // Check user email too
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    // 2. Create Dealer in Master DB
    const dealer = await this.prisma.dealer.create({
      data: {
        businessNameLegal: createDealerDto.legalName,
        businessNameTrading: createDealerDto.tradingName,
        businessAddress: createDealerDto.businessAddress,
        contactPersonName: createDealerDto.contactPersonName,
        phone: createDealerDto.phone,
        email: createDealerDto.email,
        dealerLicenseNumber: createDealerDto.dealerLicenseNumber,
        businessRegistrationNumber: createDealerDto.businessRegistrationNumber,
        bankDetails: createDealerDto.bankDetails
          ? JSON.stringify(createDealerDto.bankDetails)
          : null,
        authorizedSignatory: createDealerDto.authorizedSignatory
          ? JSON.stringify(createDealerDto.authorizedSignatory)
          : null,
        dealerAgreementSigned: createDealerDto.dealerAgreementSigned || false,
        onboardingDate: createDealerDto.onboardingDate
          ? new Date(createDealerDto.onboardingDate)
          : new Date(),
        password: createDealerDto.password, // Storing plain text as per legacy req (careful!)
        status: 'active',
        createdById,
      },
    });

    try {
      // 3. Generate DB Name and Create Tenant DB
      const databaseName = await this.generateDatabaseName(dealer.id);
      const connectionString = this.buildConnectionString(databaseName);

      await this.createTenantDatabase(databaseName);
      this.logger.log(`Database ${databaseName} created successfully`);

      // 4. Create Tenant Tables
      await this.createTenantTables(connectionString);
      this.logger.log(`Tenant tables created for ${databaseName}`);

      // 5. Create Dealer Record in Tenant DB
      await this.createDealerInTenant(dealer, connectionString, databaseName);

      // 6. Create User Account
      const saltRounds = parseInt(
        this.configService.get('PASSWORD_SALT_ROUNDS') || '10',
      );
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      let dealerRole = await this.prisma.role.findUnique({
        where: { name: 'dealer' },
      });
      if (!dealerRole) {
        dealerRole = await this.prisma.role.create({
          data: {
            name: 'dealer',
            description: 'Dealer/Showroom role',
            isSystem: true,
          },
        });
      }

      const user = await this.prisma.user.create({
        data: {
          email: dealer.email,
          password: hashedPassword,
          firstName:
            dealer.contactPersonName.split(' ')[0] || dealer.contactPersonName,
          lastName:
            dealer.contactPersonName.split(' ').slice(1).join(' ') || '',
          phone: dealer.phone,
          roleId: dealerRole.id,
          status: 'active',
          mustChangePassword: true,
        },
      });

      // 7. Update Dealer with DB Info
      const updatedDealer = await this.prisma.dealer.update({
        where: { id: dealer.id },
        data: {
          databaseName,
          databaseUrl: connectionString,
          username: dealer.email,
          credentialsGeneratedAt: new Date(),
        },
      });

      // 8. Create Tenant Database Mapping
      await this.prisma.tenantDatabaseMapping.create({
        data: {
          dealerId: dealer.id,
          databaseName,
          databaseUrl: connectionString,
          status: 'active',
        },
      });

      // Simplified return (omitting Excel generation for now as it wasn't strictly requested to be ported, avoiding complexity)
      // If Excel is needed, we can add it later.

      return {
        message: 'Dealer created successfully',
        dealer: updatedDealer,
        user: { id: user.id, email: user.email },
        credentials: {
          username: dealer.email,
          password: createDealerDto.password,
          databaseName,
          excelFile: {
            path: '',
            filename: 'credentials_not_generated.xlsx',
          },
        },
      };
    } catch (error) {
      this.logger.error('Error creating dealer, rolling back...', error.stack);
      // Rollback
      await this.prisma.dealer
        .delete({ where: { id: dealer.id } })
        .catch((e) => this.logger.error('Rollback failed', e));
      throw new InternalServerErrorException(
        `Failed to create dealer: ${error.message}`,
      );
    }
  }

  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
  }) {
    const { page, limit, search, status } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { businessNameLegal: { contains: search, mode: 'insensitive' } },
        { businessNameTrading: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;

    const [dealers, total] = await Promise.all([
      this.prisma.dealer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.dealer.count({ where }),
    ]);

    return {
      data: dealers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const dealer = await this.prisma.dealer.findUnique({
      where: { id },
      include: {
        tenantDatabaseMapping: true,
        customers: {
          select: { id: true },
        },
        warrantySales: {
          select: {
            id: true,
            warrantyPrice: true,
            warrantyPackage: {
              select: {
                id: true,
                name: true,
                description: true,
                coverageDuration: true,
              },
            },
          },
        },
        invoices: {
          select: {
            id: true,
            amount: true,
            status: true,
          },
        },
      },
    });
    if (!dealer) throw new NotFoundException('Dealer not found');

    // Parse JSON fields
    try {
      if (dealer.bankDetails && typeof dealer.bankDetails === 'string')
        dealer.bankDetails = JSON.parse(dealer.bankDetails);
      if (
        dealer.authorizedSignatory &&
        typeof dealer.authorizedSignatory === 'string'
      )
        dealer.authorizedSignatory = JSON.parse(dealer.authorizedSignatory);
    } catch (e) {
      // ignore parse error / keep as string
    }

    // Calculate statistics
    let totalCustomers = 0;
    let totalWarrantiesSold = 0;
    let totalAmountPaid = 0;
    let warrantyPackages: any[] = [];

    try {
      const tenantPrisma = await this.tenantDb.getTenantPrismaByDealerId(id);

      const [customersCount, warrantiesCount, paidAgg, packages] =
        await Promise.all([
          tenantPrisma.customer.count(),
          tenantPrisma.warrantySale.count({
            where: { customerId: { not: null }, status: 'active' },
          }),
          tenantPrisma.invoice.aggregate({
            where: {
              dealerId: id,
              status: 'paid',
              NOT: { paymentMethod: 'dealer_assignment' },
            },
            _sum: { amount: true },
          }),
          tenantPrisma.warrantyPackage.findMany({
            where: { context: 'dealer' },
            select: {
              id: true,
              name: true,
              planLevel: true,
              price12Months: true,
              price24Months: true,
              price36Months: true,
              status: true,
            },
            orderBy: { createdAt: 'desc' },
          }),
        ]);

      totalCustomers = customersCount || 0;
      totalWarrantiesSold = warrantiesCount || 0;
      totalAmountPaid = paidAgg?._sum?.amount ? Number(paidAgg._sum.amount) : 0;
      warrantyPackages = packages || [];
    } catch (e) {
      this.logger.warn(
        `Failed to load tenant stats for dealer ${id}: ${e.message}`,
      );
    }

    return {
      ...dealer,
      totalCustomers,
      totalWarranties: totalWarrantiesSold,
      amountPaid: totalAmountPaid,
      warrantyPackages,
      statistics: {
        totalCustomers,
        totalWarrantiesSold,
        totalAmountPaid,
      },
      assignedPackages: warrantyPackages,
    };
  }

  async update(id: string, updateDealerDto: UpdateDealerDto, userId: string) {
    await this.findOne(id); // check existence

    const { ...data } = updateDealerDto;

    // Handle JSON stringification for update
    const updateData: any = { ...data };
    if (data.bankDetails)
      updateData.bankDetails = JSON.stringify(data.bankDetails);
    if (data.authorizedSignatory)
      updateData.authorizedSignatory = JSON.stringify(data.authorizedSignatory);

    const updated = await this.prisma.dealer.update({
      where: { id },
      data: updateData,
    });
    return updated;
  }

  async remove(id: string, userId: string) {
    await this.findOne(id);
    // Hard delete? Or Soft? Legacy was hard delete.
    await this.prisma.dealer.delete({ where: { id } });
    return { message: 'Dealer deleted successfully' };
  }

  // --- Private Helpers ---

  private async generateDatabaseName(dealerId: string): Promise<string> {
    const sanitized = dealerId.replace(/[^a-zA-Z0-9_]/g, '_');
    return `dealer_${sanitized}`;
  }

  private buildConnectionString(databaseName: string): string {
    const dbUrl = this.configService.get<string>('DATABASE_URL') as string;
    if (!dbUrl) throw new Error('DATABASE_URL not configured');

    try {
      const url = new URL(dbUrl);
      // Reconstruct URL but replace pathname
      url.pathname = `/${databaseName}`;
      return url.toString();
    } catch (e) {
      // Fallback regex
      return dbUrl.replace(/\/[^\/]+(\?.*)?$/, `/${databaseName}$1`);
    }
  }

  private async getPostgresConnection() {
    const dbUrl = this.configService.get<string>('DATABASE_URL') || '';
    const url = new URL(dbUrl);
    url.pathname = '/postgres';
    return new Pool({ connectionString: url.toString() });
  }

  private async createTenantDatabase(databaseName: string) {
    const pool = await this.getPostgresConnection();
    const client = await pool.connect();
    try {
      const sanitized = databaseName.replace(/[^a-zA-Z0-9_]/g, '');
      // Check if exists
      const res = await client.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [sanitized],
      );
      if (res.rowCount > 0)
        throw new Error(`Database ${sanitized} already exists`);

      // Create
      await client.query(`CREATE DATABASE "${sanitized}"`);
    } finally {
      client.release();
      await pool.end();
    }
  }

  private async createTenantTables(connectionString: string) {
    const tenantSchemaPath = path.resolve(
      process.cwd(),
      'prisma',
      'tenant-schema',
    );
    const isWindows = process.platform === 'win32';

    const prismaArgs = [
      'db',
      'push',
      '--schema',
      tenantSchemaPath,
      '--accept-data-loss',
    ];

    // Construct command
    // In NestJS production build, we might be running from dist, so be careful about cwd.
    // Assuming we run from project root always.

    let command: string;
    // Quote the path to handle spaces
    if (isWindows) {
      command = `npx prisma db push --schema "${tenantSchemaPath}" --accept-data-loss`;
    } else {
      command = `npx prisma db push --schema "${tenantSchemaPath}" --accept-data-loss`;
    }

    try {
      await execAsync(command, {
        env: { ...process.env, DATABASE_URL: connectionString },
      });
    } catch (error) {
      this.logger.error('Error running prisma db push', error);
      throw new Error('Failed to create tenant tables');
    }
  }

  private async createDealerInTenant(
    dealer: any,
    connectionString: string,
    databaseName: string,
  ) {
    // Direct connection to tenant DB using temporary Prisma Client or raw query
    // Raw query via pg Pool is lighter weight than instantiating a whole PrismaClient just for one insert.

    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    try {
      const q = `
            INSERT INTO "Dealer" (
                "id", "businessNameLegal", "businessNameTrading", "businessAddress", "contactPersonName",
                "phone", "email", "dealerLicenseNumber", "businessRegistrationNumber", "bankDetails",
                "authorizedSignatory", "dealerAgreementSigned", "onboardingDate", "password", "status",
                "databaseName", "databaseUrl", "username", "createdAt", "updatedAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
          `;
      const values = [
        dealer.id,
        dealer.businessNameLegal,
        dealer.businessNameTrading,
        dealer.businessAddress,
        dealer.contactPersonName,
        dealer.phone,
        dealer.email,
        dealer.dealerLicenseNumber,
        dealer.businessRegistrationNumber,
        dealer.bankDetails,
        dealer.authorizedSignatory,
        dealer.dealerAgreementSigned,
        dealer.onboardingDate,
        dealer.password,
        dealer.status,
        databaseName,
        connectionString,
        dealer.email,
      ];
      await client.query(q, values);
    } catch (e) {
      this.logger.error('Failed to insert Dealer into tenant DB', e);
      throw e; // rethrow
    } finally {
      client.release();
      await pool.end();
    }
  }

  async verifyAndGetCredentials(
    dealerId: string,
    adminPassword: string,
    adminUserId: string,
  ) {
    // 1. Get the admin user
    const adminUser = await this.prisma.user.findUnique({
      where: { id: adminUserId },
      include: { role: true },
    });

    if (
      !adminUser ||
      !adminUser.role ||
      (adminUser.role.name !== 'super_admin' && adminUser.role.name !== 'admin')
    ) {
      throw new BadRequestException('Only Super Admin can view credentials');
    }

    // 2. Verify admin password
    const passwordMatch = await bcrypt.compare(
      adminPassword,
      adminUser.password,
    );
    if (!passwordMatch) {
      throw new BadRequestException('Invalid password');
    }

    // 3. Get dealer credentials
    const dealer = await this.prisma.dealer.findUnique({
      where: { id: dealerId },
      select: {
        id: true,
        email: true,
        password: true, // Plain text password (as per legacy requirement)
        businessNameLegal: true,
      },
    });

    if (!dealer) {
      throw new NotFoundException('Dealer not found');
    }

    // 4. Construct login URL
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const dealerUrl = frontendUrl.replace(/^(https?:\/\/)/, '$1dealer.');

    return {
      email: dealer.email,
      password: dealer.password,
      loginUrl: dealerUrl,
      businessName: dealer.businessNameLegal,
    };
  }
}
