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
import { GoogleSheetsService } from '../common/services/google-sheets.service';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

@Injectable()
export class DealerService {
  private readonly logger = new Logger(DealerService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private tenantDb: TenantDatabaseService,
    private googleSheetsService: GoogleSheetsService,
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
    let dealer: any = null;
    let databaseCreated = false;
    let dbUserCreated = false;
    let tablesCreated = false;
    let dealerInTenantCreated = false;
    let userCreated = false;
    let tenantMappingCreated = false;

    try {
      dealer = await this.prisma.dealer.create({
        data: {
          businessNameLegal: createDealerDto.legalName,
          businessNameTrading: createDealerDto.tradingName,
          businessAddress: createDealerDto.businessAddress,
          contactPersonName: createDealerDto.contactPersonName,
          phone: createDealerDto.phone,
          email: createDealerDto.email,
          dealerLicenseNumber: createDealerDto.dealerLicenseNumber,
          businessRegistrationNumber:
            createDealerDto.businessRegistrationNumber,
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

      // 3. Generate DB Name and Create Tenant DB (owned by master user)
      const databaseName = await this.generateDatabaseName(dealer.id);
      const connectionString = this.buildConnectionString(databaseName);
      const dbPassword = this.generatePassword(8); // 8-character password
      const dbUsername = `user_${dealer.id.replace(/[^a-zA-Z0-9]/g, '_')}`;

      await this.createTenantDatabaseAsOwner(databaseName);
      databaseCreated = true;
      this.logger.log(`Database ${databaseName} created successfully`);

      // 3.5. Create restricted database user
      await this.createRestrictedUser(databaseName, dbUsername, dbPassword);
      dbUserCreated = true;
      this.logger.log(
        `Restricted user ${dbUsername} created for ${databaseName}`,
      );

      // 4. Create Tenant Tables
      await this.createTenantTables(connectionString);
      tablesCreated = true;
      this.logger.log(`Tenant tables created for ${databaseName}`);

      // 5. Create Dealer Record in Tenant DB
      await this.createDealerInTenant(dealer, connectionString, databaseName);
      dealerInTenantCreated = true;

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
      userCreated = true;

      // 7. Update Dealer with DB Info and credentials
      const updatedDealer = await this.prisma.dealer.update({
        where: { id: dealer.id },
        data: {
          databaseName,
          databaseUrl: connectionString,
          username: dealer.email,
          databaseUsername: dbUsername,
          databasePassword: dbPassword, // Consider encrypting this
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
      tenantMappingCreated = true;

      // 9. Log to Google Sheets
      await this.googleSheetsService.logDealerCredentials({
        dealerName: dealer.businessNameLegal,
        databaseName,
        username: dbUsername,
        password: dbPassword,
        createdDate: new Date(),
        status: 'active',
      });

      return {
        message: 'Dealer created successfully',
        dealer: updatedDealer,
        user: { id: user.id, email: user.email },
        credentials: {
          username: dealer.email,
          password: createDealerDto.password,
          databaseName,
          databaseUsername: dbUsername,
          databasePassword: dbPassword,
          excelFile: {
            path: '',
            filename: 'credentials_not_generated.xlsx',
          },
        },
      };
    } catch (error) {
      this.logger.error('Error creating dealer, rolling back...', error.stack);

      // ROLLBACK in reverse order
      if (tenantMappingCreated && dealer) {
        await this.prisma.tenantDatabaseMapping
          .deleteMany({ where: { dealerId: dealer.id } })
          .catch((e) =>
            this.logger.error('Failed to delete tenant mapping', e),
          );
      }

      if (userCreated && dealer) {
        await this.prisma.user
          .deleteMany({ where: { email: dealer.email } })
          .catch((e) => this.logger.error('Failed to delete user', e));
      }

      if (dealerInTenantCreated && databaseCreated) {
        // Dealer record in tenant DB will be deleted with database
      }

      if (tablesCreated) {
        // Tables are part of database, will be deleted with DB
      }

      if (dbUserCreated && dealer) {
        const dbUsername = `user_${dealer.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
        await this.dropDatabaseUser(dbUsername).catch((e) =>
          this.logger.error('Failed to drop user', e),
        );
      }

      if (databaseCreated && dealer) {
        try {
          const databaseName = await this.generateDatabaseName(dealer.id);
          await this.dropDatabase(databaseName).catch((e) =>
            this.logger.error('Failed to drop database', e),
          );
        } catch (e) {
          this.logger.error('Failed to generate database name for rollback', e);
        }
      }

      if (dealer) {
        await this.prisma.dealer
          .delete({ where: { id: dealer.id } })
          .catch((e) => this.logger.error('Failed to delete dealer record', e));
      }

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

  /**
   * Create master database user (one-time setup)
   * This should be run once during initial setup
   * @param masterPassword - Password for the master user
   */
  async createMasterDatabaseUser(masterPassword: string) {
    const masterUser =
      this.configService.get<string>('DB_MASTER_USER') || 'dealer_master';
    const pool = await this.getPostgresConnection();
    const client = await pool.connect();
    try {
      // Check if user already exists
      const res = await client.query(
        `SELECT 1 FROM pg_user WHERE usename = $1`,
        [masterUser],
      );
      if (res.rowCount > 0) {
        this.logger.warn(`Master user ${masterUser} already exists`);
        return { success: true, message: 'Master user already exists' };
      }

      // Create master user with CREATEDB privilege
      await client.query(
        `CREATE USER "${masterUser}" WITH PASSWORD $1 CREATEDB`,
        [masterPassword],
      );
      this.logger.log(
        `Master database user ${masterUser} created successfully`,
      );
      return { success: true, message: `Master user ${masterUser} created` };
    } catch (error) {
      this.logger.error('Failed to create master database user', error);
      throw new InternalServerErrorException(
        `Failed to create master database user: ${error.message}`,
      );
    } finally {
      client.release();
      await pool.end();
    }
  }

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

  /**
   * Get the master database user from DATABASE_URL
   */
  private getMasterDatabaseUser(): string {
    const masterUser = this.configService.get<string>('DB_MASTER_USER');
    if (masterUser) {
      return masterUser;
    }

    // Extract username from DATABASE_URL if not specified
    const dbUrl = this.configService.get<string>('DATABASE_URL') || '';
    try {
      const url = new URL(dbUrl);
      return url.username || 'postgres'; // Default to postgres if no username in URL
    } catch (e) {
      // Fallback: try to extract from connection string format
      const match = dbUrl.match(/:\/\/([^:]+):/);
      return match ? match[1] : 'postgres';
    }
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

  /**
   * Create tenant database owned by master user
   */
  private async createTenantDatabaseAsOwner(databaseName: string) {
    const pool = await this.getPostgresConnection();
    const client = await pool.connect();
    try {
      const sanitized = databaseName.replace(/[^a-zA-Z0-9_]/g, '');
      const masterUser = this.getMasterDatabaseUser();

      // Check if database exists
      const res = await client.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [sanitized],
      );
      if (res.rowCount > 0)
        throw new Error(`Database ${sanitized} already exists`);

      // Create database owned by master user (from DATABASE_URL)
      await client.query(
        `CREATE DATABASE "${sanitized}" OWNER "${masterUser}"`,
      );
      this.logger.log(`Database ${sanitized} created with owner ${masterUser}`);
    } finally {
      client.release();
      await pool.end();
    }
  }

  /**
   * Generate 8-character alphanumeric password
   */
  private generatePassword(length: number = 8): string {
    const charset =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let password = '';
    const randomBytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      password += charset[randomBytes[i] % charset.length];
    }
    return password;
  }

  /**
   * Create restricted database user with CRUD + CREATE TABLE permissions
   */
  private async createRestrictedUser(
    databaseName: string,
    username: string,
    password: string,
  ) {
    const pool = await this.getPostgresConnection();
    const client = await pool.connect();
    try {
      const sanitizedDb = databaseName.replace(/[^a-zA-Z0-9_]/g, '');
      const sanitizedUser = username.replace(/[^a-zA-Z0-9_]/g, '_');

      // 1. Create user
      // Note: PostgreSQL doesn't support parameterized queries for CREATE USER
      // We need to escape single quotes in the password
      const escapedPassword = password.replace(/'/g, "''");
      await client.query(
        `CREATE USER "${sanitizedUser}" WITH PASSWORD '${escapedPassword}'`,
      );

      // 2. Grant connect permission
      await client.query(
        `GRANT CONNECT ON DATABASE "${sanitizedDb}" TO "${sanitizedUser}"`,
      );

      // 3. Connect to the dealer database to grant schema permissions
      // We need to use a new connection for this
      const dbUrl = this.configService.get<string>('DATABASE_URL') || '';
      const url = new URL(dbUrl);
      url.pathname = `/${sanitizedDb}`;
      const dbPool = new Pool({ connectionString: url.toString() });
      const dbClient = await dbPool.connect();

      try {
        // 4. Grant schema usage
        await dbClient.query(
          `GRANT USAGE ON SCHEMA public TO "${sanitizedUser}"`,
        );

        // 5. Grant CRUD + CREATE TABLE permissions on existing tables
        await dbClient.query(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${sanitizedUser}"`,
        );

        // 6. Grant CREATE permission on schema (allows CREATE TABLE)
        await dbClient.query(
          `GRANT CREATE ON SCHEMA public TO "${sanitizedUser}"`,
        );

        // 7. Grant sequence permissions
        await dbClient.query(
          `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${sanitizedUser}"`,
        );

        // 8. Set default privileges for future tables
        await dbClient.query(`
          ALTER DEFAULT PRIVILEGES IN SCHEMA public 
          GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${sanitizedUser}"
        `);

        await dbClient.query(`
          ALTER DEFAULT PRIVILEGES IN SCHEMA public 
          GRANT USAGE, SELECT ON SEQUENCES TO "${sanitizedUser}"
        `);

        this.logger.log(
          `Restricted user ${sanitizedUser} created with permissions for ${sanitizedDb}`,
        );
      } finally {
        dbClient.release();
        await dbPool.end();
      }
    } finally {
      client.release();
      await pool.end();
    }
  }

  /**
   * Drop database user (for rollback)
   */
  private async dropDatabaseUser(username: string) {
    const pool = await this.getPostgresConnection();
    const client = await pool.connect();
    try {
      const sanitized = username.replace(/[^a-zA-Z0-9_]/g, '_');
      await client.query(`DROP USER IF EXISTS "${sanitized}"`);
      this.logger.log(`Dropped user ${sanitized}`);
    } catch (error) {
      this.logger.error(`Failed to drop user ${username}`, error);
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }

  /**
   * Drop database (for rollback)
   */
  private async dropDatabase(databaseName: string) {
    const pool = await this.getPostgresConnection();
    const client = await pool.connect();
    try {
      const sanitized = databaseName.replace(/[^a-zA-Z0-9_]/g, '');

      // Terminate all connections to the database first
      await client.query(
        `
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid()
      `,
        [sanitized],
      );

      // Drop the database
      await client.query(`DROP DATABASE IF EXISTS "${sanitized}"`);
      this.logger.log(`Dropped database ${sanitized}`);
    } catch (error) {
      this.logger.error(`Failed to drop database ${databaseName}`, error);
      throw error;
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
