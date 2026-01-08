import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/tenant-client';
import { PrismaService } from '../../prisma/prisma.service';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
/**
 * TenantDatabaseService
 * Manages dynamic database connections for multi-tenant architecture
 */
@Injectable()
export class TenantDatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(TenantDatabaseService.name);
  private readonly tenantDbClients: Map<string, PrismaClient> = new Map();
  private readonly DEFAULT_POOL_SIZE = 5;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  async onModuleDestroy() {
    await this.disconnectAllTenantDatabases();
  }

  /**
   * Get the base database URL (without database name)
   */
  private getBaseDatabaseUrl(): string {
    const dbUrl = this.configService.get<string>('DATABASE_URL');
    if (!dbUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    try {
      const url = new URL(dbUrl);
      let baseUrl = `${url.protocol}//`;

      if (url.username) {
        baseUrl += url.username;
        if (url.password) {
          baseUrl += `:${url.password}`;
        }
        baseUrl += '@';
      }

      baseUrl += url.hostname;

      if (url.port) {
        baseUrl += `:${url.port}`;
      }

      if (url.search) {
        baseUrl += url.search;
      }

      return baseUrl;
    } catch (error) {
      // Fallback: extract base URL using string manipulation
      this.logger.warn(
        `Error parsing DATABASE_URL with URL constructor: ${error.message}`,
      );

      const queryIndex = dbUrl.indexOf('?');
      const urlWithoutQuery =
        queryIndex > -1 ? dbUrl.substring(0, queryIndex) : dbUrl;
      const lastSlashIndex = urlWithoutQuery.lastIndexOf('/');

      if (lastSlashIndex > -1) {
        const base = urlWithoutQuery.substring(0, lastSlashIndex);
        const query = queryIndex > -1 ? dbUrl.substring(queryIndex) : '';
        return base + query;
      }

      throw new Error(`Invalid DATABASE_URL format`);
    }
  }

  /**
   * Build connection string for a specific database
   */
  buildConnectionString(databaseName: string): string {
    if (!databaseName) {
      throw new Error('Database name is required');
    }

    const sanitizedDbName = databaseName.replace(/[^a-zA-Z0-9_]/g, '');
    const baseUrl = this.getBaseDatabaseUrl();

    const hasQuery = baseUrl.includes('?');
    if (hasQuery) {
      const queryIndex = baseUrl.indexOf('?');
      const baseWithoutQuery = baseUrl.substring(0, queryIndex);
      const queryString = baseUrl.substring(queryIndex);
      return `${baseWithoutQuery}/${sanitizedDbName}${queryString}`;
    }

    return `${baseUrl}/${sanitizedDbName}`;
  }

  /**
   * Get or create a Prisma client for a specific tenant database
   */
  async getTenantPrismaClient(
    databaseName: string,
    connectionString: string | null = null,
  ): Promise<any> {
    if (!databaseName) {
      throw new Error('Database name is required');
    }

    // Check if client already exists in cache
    if (this.tenantDbClients.has(databaseName)) {
      const client = this.tenantDbClients.get(databaseName)!;
      try {
        await client.$queryRaw`SELECT 1`;
        return client;
      } catch (error) {
        this.logger.warn(
          `Connection health check failed for ${databaseName}, recreating...`,
        );
        try {
          await client.$disconnect();
        } catch (disconnectError) {
          // Ignore disconnect errors
        }
        this.tenantDbClients.delete(databaseName);
      }
    }

    // Build connection string if not provided
    const connString =
      connectionString || this.buildConnectionString(databaseName);

    // Validate connection string format
    if (!connString || typeof connString !== 'string') {
      throw new Error(`Invalid connection string for database ${databaseName}`);
    }

    if (!connString.match(/^postgresql?:\/\//)) {
      throw new Error(
        `Invalid connection string format for database ${databaseName}`,
      );
    }

    // Create new Prisma client by using the PrismaPg adapter
    // This is required since driverAdapters are enabled in schema
    try {
      const pool = new Pool({ connectionString: connString });
      const adapter = new PrismaPg(pool);
      const client = new PrismaClient({
        log:
          process.env.NODE_ENV === 'development'
            ? ['error', 'warn']
            : ['error'],
        adapter,
      } as any);

      // Test the connection
      await client.$queryRaw`SELECT 1`;

      // Cache the client
      this.tenantDbClients.set(databaseName, client);

      return client;
    } catch (error) {
      throw new Error(
        `Failed to connect to tenant database ${databaseName}: ${error.message}`,
      );
    }
  }

  /**
   * Get tenant Prisma client by dealer ID
   */
  async getTenantPrismaByDealerId(dealerId: string): Promise<any> {
    const dealer = await this.prisma.dealer.findUnique({
      where: { id: dealerId },
      select: {
        databaseName: true,
        databaseUrl: true,
      },
    });

    if (!dealer) {
      throw new Error(`Dealer with ID ${dealerId} not found`);
    }

    if (!dealer.databaseName) {
      throw new Error(`Database not configured for dealer ${dealerId}`);
    }

    return this.getTenantPrismaClient(dealer.databaseName, dealer.databaseUrl);
  }

  /**
   * Check if a database exists
   */
  async databaseExists(databaseName: string): Promise<boolean> {
    if (!databaseName) {
      return false;
    }

    try {
      const adminConnString = this.buildConnectionString('postgres');
      const pool = new Pool({ connectionString: adminConnString });
      const client = await pool.connect();

      try {
        const sanitizedDbName = databaseName.replace(/[^a-zA-Z0-9_]/g, '');
        const result = await client.query(
          'SELECT 1 FROM pg_database WHERE datname = $1',
          [sanitizedDbName],
        );
        return result.rowCount !== null && result.rowCount > 0;
      } finally {
        client.release();
        await pool.end();
      }
    } catch (error) {
      this.logger.error(
        `Error checking database existence for ${databaseName}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Disconnect a specific tenant database client
   */
  async disconnectTenantDatabase(databaseName: string): Promise<void> {
    if (this.tenantDbClients.has(databaseName)) {
      const client = this.tenantDbClients.get(databaseName)!;
      try {
        await client.$disconnect();
      } catch (error) {
        this.logger.error(
          `Error disconnecting tenant database ${databaseName}: ${error.message}`,
        );
      }
      this.tenantDbClients.delete(databaseName);
    }
  }

  /**
   * Disconnect all tenant database clients
   */
  async disconnectAllTenantDatabases(): Promise<void> {
    const disconnectPromises = Array.from(this.tenantDbClients.keys()).map(
      (dbName) => this.disconnectTenantDatabase(dbName),
    );
    await Promise.all(disconnectPromises);
    this.logger.log('All tenant database connections disconnected');
  }

  /**
   * Get health status of a tenant database
   */
  async getTenantDatabaseHealth(
    databaseName: string,
  ): Promise<{ status: string; latency?: number; error?: string }> {
    try {
      const startTime = Date.now();
      const client = await this.getTenantPrismaClient(databaseName);
      await client.$queryRaw`SELECT 1`;
      const latency = Date.now() - startTime;

      return {
        status: 'healthy',
        latency,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
      };
    }
  }
}
