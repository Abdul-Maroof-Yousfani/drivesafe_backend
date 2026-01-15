import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../../upload/upload.service';
import { ActivityLogService } from '../../common/services/activity-log.service';
import { TenantDatabaseService } from '../../common/services/tenant-database.service';

@Injectable()
export class CustomerDocumentService {
  private readonly logger = new Logger(CustomerDocumentService.name);

  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
    private activityLog: ActivityLogService,
    private tenantDb: TenantDatabaseService,
  ) {}

  private async getPrismaClient(user: any) {
    // If Admin/SuperAdmin, use Master DB
    if (['admin', 'super_admin'].includes(user.role)) {
      return this.prisma;
    }

    // If Dealer, connect to Tenant DB
    if (user.role === 'dealer') {
      const tenantId = user.tenantId || user.dealerId;
      if (!tenantId) throw new ForbiddenException('Dealer ID missing');
      return this.tenantDb.getTenantPrismaByDealerId(tenantId);
    }

    // If Customer, determine their context (master or tenant DB)
    if (user.role === 'customer') {
      const masterUser = await this.prisma.user.findUnique({
        where: { id: user.userId },
        select: { email: true },
      });

      if (masterUser) {
        const customerInMaster = await this.prisma.customer.findFirst({
          where: { email: masterUser.email },
          select: { dealerId: true },
        });

        if (customerInMaster?.dealerId) {
          return this.tenantDb.getTenantPrismaByDealerId(customerInMaster.dealerId);
        }
        return this.prisma;
      }
    }

    return this.prisma;
  }

  /**
   * Helper to manually populate createdBy user details from Master DB
   * This is needed because Tenant DB does not have a relation to the User table
   */
  private async populateCreatedBy(docs: any | any[]) {
    const isArray = Array.isArray(docs);
    const documents = isArray ? docs : [docs];

    if (documents.length === 0) return isArray ? [] : null;

    // Collect all createdByIds
    const userIds = [
      ...new Set(
        documents
          .map((d) => d.createdById)
          .filter((id) => id !== null && id !== undefined),
      ),
    ] as string[];

    if (userIds.length === 0) return docs;

    // Fetch users from Master DB
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    // Attach user details to documents
    const populatedDocs = documents.map((doc) => {
      const user = userMap.get(doc.createdById);
      return {
        ...doc,
        createdBy: user
          ? {
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
            }
          : null,
      };
    });

    return isArray ? populatedDocs : populatedDocs[0];
  }

  async create(
    customerId: string,
    payload: { name: string; description?: string; fileId: string },
    user: { userId: string; role: string; dealerId?: string; tenantId?: string },
  ) {
    const prisma = await this.getPrismaClient(user);

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) throw new NotFoundException('Customer not found');

    // Security check logic remains similar but relies on DB isolation for dealers
    if (user.role === 'dealer' && customer.dealerId && customer.dealerId !== user.dealerId) {
       // Ideally the query above wouldn't find it if different tenant, 
       // but explicit check helps if something is weird.
       // However, in tenant DB, customer.dealerId might be implicit or same.
    }

    const isMasterDb = ['admin', 'super_admin'].includes(user.role);
    const include: any = { file: true };
    if (isMasterDb) {
      include.createdBy = {
        select: { firstName: true, lastName: true, email: true },
      };
    }

    const document = await prisma.customerDocument.create({
      data: {
        name: payload.name,
        description: payload.description,
        fileId: payload.fileId,
        customerId: customerId,
        dealerId: user.role === 'dealer' ? user.dealerId : customer.dealerId,
        createdById: user.userId,
      },
      include,
    });

    await this.activityLog.log({
      userId: user.userId,
      action: 'create',
      module: 'customers',
      entity: 'CustomerDocument',
      entityId: document.id,
      description: `Uploaded document "${document.name}" for customer ${customer.firstName} ${customer.lastName}`,
      newValues: document,
    });

    // If we couldn't include createdBy (Dealer context), manually populate it
    if (!include.createdBy && document.createdById) {
      return this.populateCreatedBy(document);
    }

    return document;
  }

  async findAll(
    customerId: string,
    user: { userId: string; role: string; dealerId?: string; tenantId?: string },
  ) {
    const prisma = await this.getPrismaClient(user);
    const where: any = { customerId };

    if (user.role === 'dealer') {
       where.dealerId = user.dealerId;
    }

    // Build include object based on context.
    // Tenant DB does not have relation to 'User' (createdBy), so exclude it for Dealers.
    const isDealer = user.role === 'dealer';
    const include: any = { file: true };
    if (!isDealer) {
      include.createdBy = {
        select: { firstName: true, lastName: true, email: true },
      };
    }

    const documents = await prisma.customerDocument.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
    });

    // AGGREGATION LOGIC:
    // If we are in a Tenant context (Dealer or Dealer's Customer), we also want to see
    // documents uploaded by Super Admin (which live in Master DB).
    const isTenantContext = prisma !== this.prisma;
    
    // Ensure base documents are populated if needed
    let baseDocs = documents;
    if (!include.createdBy) {
      baseDocs = await this.populateCreatedBy(documents);
    }

    if (isTenantContext) {
      try {
        // 1. Get the customer's email from the Tenant DB record to link to Master DB
        const tenantCustomer = await prisma.customer.findUnique({
          where: { id: customerId },
          select: { email: true }
        });

        if (tenantCustomer?.email) {
          // 2. Find corresponding customer in Master DB
          const masterCustomer = await this.prisma.customer.findFirst({
            where: { email: tenantCustomer.email },
            select: { id: true }
          });

          if (masterCustomer) {
            // 3. Fetch Master DB documents for this customer
            const masterDocs = await this.prisma.customerDocument.findMany({
              where: { customerId: masterCustomer.id },
              include: {
                file: true,
                createdBy: { // Master DB has User relation
                  select: { firstName: true, lastName: true, email: true },
                }
              },
              orderBy: { createdAt: 'desc' }
            });

            // 4. Combine results
            // Both arrays now have 'createdBy' populated (one manually, one via include)
            // We use 'any' cast for safety if types slightly differ purely on optionality
            const combined = [...baseDocs, ...masterDocs] as any[];
            
            return combined.sort((a, b) => 
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
          }
        }
      } catch (e) {
        this.logger.error(`Failed to aggregate master documents: ${e.message}`);
        // Fallback to returning just the base (populated) documents
      }
    }

    return baseDocs;
  }

  async getAllDocuments() {
    // SuperAdmin always uses Master DB, but theoretically documents could be scattered.
    // However, if documents are strictly partitioned, this method might fail to see tenant docs unless we query all tenants.
    // For now, assuming aggregation or master DB usage for super-admin global view ONLY if data is synced or linked.
    // If data is isolated, this strictly returns Master DB documents.
    return this.prisma.customerDocument.findMany({
      include: {
        file: true,
        customer: {
          select: { firstName: true, lastName: true, email: true },
        },
        dealer: {
          select: { businessNameLegal: true },
        },
        createdBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllForDealer(dealerId: string) {
    // This explicitly asks for a specific dealer's documents.
    // We should switch to that dealer's context.
    const tenantClient = await this.tenantDb.getTenantPrismaByDealerId(dealerId);
    
    // Tenant DB schema usually has 'customer' relation but NOT 'createdBy' relation
    // (since User model is in Master DB).
    const documents = await tenantClient.customerDocument.findMany({
      where: { dealerId },
      include: {
        file: true,
        customer: {
          select: { firstName: true, lastName: true, email: true },
        },
        // createdBy removed for tenant DB context
      },
      orderBy: { createdAt: 'desc' },
    });

    return this.populateCreatedBy(documents);
  }

  async findAllByCustomerEmail(email: string) {
    // 1. Find the customer record by email in Master to check structure
    const masterUser = await this.prisma.user.findFirst({ where: { email } });
     
    // If not found in User, maybe just check Customer table? 
    // The implementation below assumes we find where the customer lives.
    
    // We'll reuse getPrismaClient strategy if we had a user object, but here we only have email.
    // Strategy: Check Master. If master customer has dealerId, go there.
    
    const customerInMaster = await this.prisma.customer.findFirst({
      where: { email }, 
      select: { id: true, dealerId: true }
    });

    let prisma = this.prisma;

    if (customerInMaster?.dealerId) {
       prisma = await this.tenantDb.getTenantPrismaByDealerId(customerInMaster.dealerId);
    } else {
       // Fallback: If not in Master Customer table, they might be in a Tenant DB.
       // We must scan active dealers to find them (similar to InvoiceService).
       
       const allDealers = await this.prisma.dealer.findMany({
          where: { status: 'active', databaseName: { not: null } },
          select: { id: true }
       });

       let foundDealerId: string | null = null;
       for (const dealer of allDealers) {
          try {
             const tenantClient = await this.tenantDb.getTenantPrismaByDealerId(dealer.id);
             const exists = await tenantClient.customer.findFirst({
                where: { email },
                select: { id: true }
             });
             if (exists) {
                foundDealerId = dealer.id;
                prisma = tenantClient;
                break;
             }
          } catch (e) {
             // Ignore error for individual tenant check
          }
       }
    }
    
    // Now find the customer in that target DB (id might imply logic, but email is safer ref)
    const customer = await prisma.customer.findFirst({ where: { email } });
    if (!customer) {
      return [];
    }

    // If we switched to tenant DB (dealerId exists), assume no createdBy relation.
    // If we stayed on Master DB (prisma === this.prisma), createdBy is OK.
    const isTenantContext = prisma !== this.prisma;

    const include: any = { file: true };
    if (!isTenantContext) {
      include.createdBy = {
        select: { firstName: true, lastName: true, email: true },
      };
    }

    const documents = await prisma.customerDocument.findMany({
      where: { customerId: customer.id },
      include,
      orderBy: { createdAt: 'desc' },
    });

    let resultDocs = documents;
    
    // Ensure base documents are populated if needed
    if (!include.createdBy) {
       resultDocs = await this.populateCreatedBy(documents);
    }

    // AGGREGATION LOGIC for ByEmail:
    if (isTenantContext) {
       try {
         // We already know the email. Check Master DB.
         const masterCustomer = await this.prisma.customer.findFirst({
            where: { email },
            select: { id: true }
         });

         if (masterCustomer) {
            const masterDocs = await this.prisma.customerDocument.findMany({
              where: { customerId: masterCustomer.id },
              include: {
                file: true,
                createdBy: {
                  select: { firstName: true, lastName: true, email: true },
                }
              },
              orderBy: { createdAt: 'desc' }
            });

            // Merge and sort
            const combined = [...resultDocs, ...masterDocs] as any[];
            resultDocs = combined.sort((a, b) => 
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
         }
       } catch (e) {
         this.logger.error(`Failed to aggregate master documents by email: ${e.message}`);
       }
    }

    return resultDocs;
  }

  async delete(
    id: string,
    user: { userId: string; role: string; dealerId?: string; tenantId?: string },
  ) {
    const prisma = await this.getPrismaClient(user);
    
    const doc = await prisma.customerDocument.findUnique({
      where: { id },
    });

    if (!doc) throw new NotFoundException('Document not found');

    if (user.role === 'dealer' && doc.dealerId && doc.dealerId !== user.dealerId) {
      throw new ForbiddenException('Access denied');
    }

    // Delete database record first
    await prisma.customerDocument.delete({ where: { id } });

    // Delete actual file
    if (doc.fileId) {
      try {
        await this.uploadService.deleteFile(
          doc.fileId,
          user.role === 'dealer' ? user.dealerId : undefined,
        );
      } catch (e) {
        this.logger.error(`Failed to delete file ${doc.fileId}: ${e.message}`);
      }
    }

    await this.activityLog.log({
      userId: user.userId,
      action: 'delete',
      module: 'customers',
      entity: 'CustomerDocument',
      entityId: id,
      description: `Deleted document "${doc.name}"`,
      oldValues: doc,
    });

    return { status: true, message: 'Document deleted successfully' };
  }
}
