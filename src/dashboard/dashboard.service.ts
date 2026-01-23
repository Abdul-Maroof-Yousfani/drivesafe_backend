import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { TenantDatabaseService } from '../common/services/tenant-database.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private tenantDb: TenantDatabaseService,
  ) {}

  async getSuperAdminDashboard() {
    try {
      const [
        dealersCount,
        customersCount,
        warrantiesCount,
        directEarningsAgg,
        packagesCount,
        dealers,
      ] = await Promise.all([
        this.prisma.dealer.count(),
        this.prisma.customer.count({ where: { dealerId: null } }),
        this.prisma.warrantySale.count({ where: { dealerId: null } }),
        this.prisma.warrantySale.aggregate({
          _sum: { warrantyPrice: true },
          where: { status: 'active', dealerId: null },
        }),
        this.prisma.warrantyPackage.count(),
        this.prisma.dealer.findMany({
          where: { status: 'active' },
          select: { id: true, businessNameLegal: true, businessNameTrading: true },
        }),
      ]);

      // Package Name Mapping for aggregation
      const allMasterPackages = await this.prisma.warrantyPackage.findMany({
        select: { id: true, name: true },
      });
      const masterPackageMap = new Map(allMasterPackages.map((p) => [p.id, p.name]));

      // Aggregate SA direct package sales
      const packageAnalytics: Record<string, number> = {};
      const saSalesPerPackage = await this.prisma.warrantySale.groupBy({
        by: ['warrantyPackageId'],
        _count: { id: true },
        where: { dealerId: null },
      });

      saSalesPerPackage.forEach((s) => {
        const name = masterPackageMap.get(s.warrantyPackageId) || 'Unknown';
        packageAnalytics[name] = (packageAnalytics[name] || 0) + s._count.id;
      });

      // Aggregate dealer invoices and package sales across all tenant databases
      const dealerAnalytics: Array<{ name: string; revenue: number; policies: number; pendingRevenue: number }> = [];

      const dealerAggs = await Promise.all(
        dealers.map(async (dealer) => {
          try {
            const mapping = await this.prisma.tenantDatabaseMapping.findFirst({
              where: { dealerId: dealer.id },
            });

            if (!mapping || !mapping.databaseUrl) {
              return { totalAmount: 0, pendingCount: 0, pendingAmount: 0, packageSales: [] };
            }

            const pool = new Pool({ connectionString: mapping.databaseUrl });
            const client = await pool.connect();

            try {
              const [totalAmountRes, pendingCountRes, pendingAmountRes, packageSalesRes] =
                await Promise.all([
                  client.query(
                    'SELECT SUM("amount") as sum FROM "Invoice" WHERE "dealerId" = $1 AND "paymentMethod" != $2',
                    [dealer.id, 'dealer_assignment'],
                  ),
                  client.query(
                    'SELECT COUNT(*) as count FROM "Invoice" WHERE "dealerId" = $1 AND "status" = $2 AND "paymentMethod" != $3',
                    [dealer.id, 'pending', 'dealer_assignment'],
                  ),
                  client.query(
                    'SELECT SUM("amount") as sum FROM "Invoice" WHERE "dealerId" = $1 AND "status" = $2 AND "paymentMethod" != $3',
                    [dealer.id, 'pending', 'dealer_assignment'],
                  ),
                  // Get package sales counts from tenant
                  client.query(
                    'SELECT p."name", COUNT(s."id") as count ' +
                    'FROM "WarrantySale" s ' +
                    'JOIN "WarrantyPackage" p ON s."warrantyPackageId" = p."id" ' +
                    'WHERE s."customerId" IS NOT NULL ' +
                    'GROUP BY p."name"'
                  ),
                ]);

              const revenue = Number(totalAmountRes.rows[0]?.sum || 0);
              const pendingRevenue = Number(pendingAmountRes.rows[0]?.sum || 0);
              const policies = packageSalesRes.rows.reduce((sum: number, s: any) => sum + parseInt(s.count || '0'), 0);
              
              dealerAnalytics.push({
                name: dealer.businessNameLegal ,
                revenue,
                pendingRevenue,
                policies,
              });

              return {
                totalAmount: revenue,
                pendingCount: parseInt(pendingCountRes.rows[0]?.count || '0'),
                pendingAmount: pendingRevenue,
                packageSales: packageSalesRes.rows,
              };
            } finally {
              client.release();
              await pool.end();
            }
          } catch (err: any) {
            this.logger.warn(
              `Failed tenant aggregation for dealer ${dealer.id}: ${err?.message || err}`,
            );
            return { totalAmount: 0, pendingCount: 0, pendingAmount: 0, packageSales: [] };
          }
        }),
      );

      // Merge tenant package sales into global packageAnalytics
      dealerAggs.forEach((agg) => {
        agg.packageSales.forEach((s: any) => {
          packageAnalytics[s.name] = (packageAnalytics[s.name] || 0) + parseInt(s.count);
        });
      });

      const dealerTotalRevenue = dealerAggs.reduce(
        (sum, x) => sum + (Number(x.totalAmount) || 0),
        0,
      );
      const pendingInvoicesCount = dealerAggs.reduce(
        (sum, x) => sum + (Number(x.pendingCount) || 0),
        0,
      );
      const pendingInvoicesAmount = dealerAggs.reduce(
        (sum, x) => sum + (Number(x.pendingAmount) || 0),
        0,
      );

      // Format Chart Data
      const topPackages = Object.entries(packageAnalytics)
        .map(([name, sales]) => ({ name, sales }))
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 5);

      const topDealers = dealerAnalytics
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      // Recent sales
      const recentSales = await this.prisma.warrantySale.findMany({
        where: { dealerId: null },
        orderBy: { saleDate: 'desc' },
        take: 5,
        include: {
          customer: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          warrantyPackage: { select: { name: true } },
        },
      });

      const recentCustomers = recentSales.map((s) => ({
        id: s.customer?.id || s.id,
        name: s.customer
          ? `${s.customer.firstName} ${s.customer.lastName}`
          : 'Unknown',
        email: s.customer?.email || '',
        warrantyPackage: s.warrantyPackage?.name || '',
        date: new Date(s.saleDate).toLocaleDateString(),
      }));

      return {
        status: true,
        data: {
          totalDealers: dealersCount,
          totalCustomers: customersCount,
          totalWarranties: warrantiesCount,
          totalEarnings:
            Number(directEarningsAgg._sum.warrantyPrice || 0) +
            dealerTotalRevenue,
          pendingInvoices: pendingInvoicesCount,
          pendingInvoicesAmount,
          totalPackages: packagesCount,
          recentCustomers,
          topPackages,
          topDealers,
        },
      };
    } catch (error: any) {
      this.logger.error('Super Admin dashboard error:', error);
      throw new InternalServerErrorException('Failed to load dashboard');
    }
  }

  async getDealerDashboard(user: any) {
    try {
      const tenantId = user.tenantId || user.userId;
      const mapping = await this.prisma.tenantDatabaseMapping.findFirst({
        where: { dealerId: tenantId },
      });

      if (!mapping || !mapping.databaseUrl) {
        throw new InternalServerErrorException(
          'Dealer tenant database not configured',
        );
      }

      // Use pg Pool instead of dynamic Prisma Client
      const pool = new Pool({ connectionString: mapping.databaseUrl });
      const client = await pool.connect();

      try {
        const [
          customersCountRes,
          warrantiesCountRes,
          earningsRes,
          invoicesTotalRes,
          pendingInvoicesCountRes,
          pendingInvoicesAmountRes,
        ] = await Promise.all([
          // Customers count
          client.query('SELECT COUNT(*) as count FROM "Customer"'),
          // Warranties count (customerId not null)
          client.query(
            'SELECT COUNT(*) as count FROM "WarrantySale" WHERE "customerId" IS NOT NULL',
          ),
          // Earnings (active warranties)
          client.query(
            'SELECT SUM("warrantyPrice") as sum FROM "WarrantySale" WHERE "status" = $1 AND "customerId" IS NOT NULL',
            ['active'],
          ),
          // Total Invoices amount (excl dealer_assignment)
          client.query(
            'SELECT SUM("amount") as sum FROM "Invoice" WHERE "paymentMethod" != $1',
            ['dealer_assignment'],
          ),
          // Pending Invoices count
          client.query(
            'SELECT COUNT(*) as count FROM "Invoice" WHERE "status" = $1 AND "paymentMethod" != $2',
            ['pending', 'dealer_assignment'],
          ),
          // Pending Invoices amount
          client.query(
            'SELECT SUM("amount") as sum FROM "Invoice" WHERE "status" = $1 AND "paymentMethod" != $2',
            ['pending', 'dealer_assignment'],
          ),
        ]);

        const customersCount = parseInt(
          customersCountRes.rows[0]?.count || '0',
        );
        const warrantiesCount = parseInt(
          warrantiesCountRes.rows[0]?.count || '0',
        );
        const totalRevenue = Number(earningsRes.rows[0]?.sum || 0);
        const totalCost = Number(invoicesTotalRes.rows[0]?.sum || 0);
        const amountOwed = Number(pendingInvoicesAmountRes.rows[0]?.sum || 0);
        const pendingInvoicesCount = parseInt(
          pendingInvoicesCountRes.rows[0]?.count || '0',
        );

        const profit = totalRevenue - totalCost;

        return {
          status: true,
          data: {
            totalCustomers: customersCount,
            totalWarranties: warrantiesCount,
            totalEarnings: totalRevenue,
            totalRevenue,
            amountOwed,
            profit,
            pendingInvoices: pendingInvoicesCount,
            pendingInvoicesAmount: amountOwed,
          },
        };
      } finally {
        client.release();
        await pool.end();
      }
    } catch (error: any) {
      this.logger.error('Dealer dashboard error:', error);
      throw new InternalServerErrorException('Failed to load dashboard');
    }
  }

  async getCustomerDashboard(user: any) {
    try {
      const userEmail = user?.email;
      if (!userEmail) {
        throw new InternalServerErrorException('User email not found in token');
      }

      const allWarranties: any[] = [];

      // Step 1: Check if customer is SA's customer (in master DB with dealerId = null)
      try {
        const masterCustomers = await this.prisma.customer.findMany({
          where: {
            email: userEmail,
            dealerId: null, // SA's customers have no dealerId
          },
          select: { id: true },
        });

        if (masterCustomers.length > 0) {
          // Customer is SA's customer - fetch from master DB only
          const customerIds = masterCustomers.map((c) => c.id);
          const masterWarranties = await this.prisma.warrantySale.findMany({
            where: {
              customerId: { in: customerIds },
              status: 'active',
            },
            include: {
              warrantyPackage: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  planLevel: true,
                  coverageDuration: true,
                  durationUnit: true,
                  excess: true,
                  labourRatePerHour: true,
                  fixedClaimLimit: true,
                  price: true,
                },
              },
              dealer: {
                select: {
                  businessNameLegal: true,
                  businessNameTrading: true,
                  email: true,
                  phone: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          });
          allWarranties.push(...masterWarranties);

          // SA customer found, no need to check tenant DBs
          return {
            status: true,
            data: { warranties: allWarranties, count: allWarranties.length },
          };
        }
      } catch (error) {
        this.logger.error(
          `Error fetching warranties from Master DB: ${error.message}`,
        );
        // Continue to tenant DBs even if master DB fails
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

      // Query each dealer's tenant DB for warranty sales
      for (const dealer of dealers) {
        try {
          const tenantPrisma = await this.tenantDb.getTenantPrismaByDealerId(
            dealer.id,
          );

          // Find customer in this dealer's tenant DB
          const customer = await tenantPrisma.customer.findFirst({
            where: { email: userEmail },
            select: { id: true },
          });

          if (!customer) {
            continue; // Customer not found in this dealer's DB
          }

          // Customer found in this dealer's tenant DB - fetch warranties from here
          const tenantWarranties = await tenantPrisma.warrantySale.findMany({
            where: {
              customerId: customer.id,
              status: 'active',
            },
            include: {
              warrantyPackage: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  planLevel: true,
                  coverageDuration: true,
                  durationUnit: true,
                  excess: true,
                  labourRatePerHour: true,
                  fixedClaimLimit: true,
                  price: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          });

          // Add dealer info to each warranty and add to allWarranties
          for (const warranty of tenantWarranties) {
            allWarranties.push({
              ...warranty,
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
            `Error fetching warranties from dealer ${dealer.id} tenant DB: ${error.message}`,
          );
          // Continue to next dealer even if this one fails
        }
      }

      // Sort by creation date (most recent first)
      allWarranties.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      return {
        status: true,
        data: { warranties: allWarranties, count: allWarranties.length },
      };
    } catch (error: any) {
      this.logger.error('Customer dashboard error:', error);
      throw new InternalServerErrorException('Failed to load dashboard');
    }
  }
}
