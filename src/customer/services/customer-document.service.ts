import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../../upload/upload.service';
import { ActivityLogService } from '../../common/services/activity-log.service';

@Injectable()
export class CustomerDocumentService {
  private readonly logger = new Logger(CustomerDocumentService.name);

  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
    private activityLog: ActivityLogService,
  ) {}

  async create(
    customerId: string,
    payload: { name: string; description?: string; fileId: string },
    user: { userId: string; role: string; dealerId?: string },
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) throw new NotFoundException('Customer not found');

    // Security check: Dealers can only upload for their own customers
    if (user.role === 'dealer' && customer.dealerId !== user.dealerId) {
      throw new ForbiddenException('You can only upload documents for your own customers');
    }

    const document = await this.prisma.customerDocument.create({
      data: {
        name: payload.name,
        description: payload.description,
        fileId: payload.fileId,
        customerId: customerId,
        dealerId: user.role === 'dealer' ? user.dealerId : customer.dealerId,
        createdById: user.userId,
      },
      include: {
        file: true,
        createdBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
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

    return document;
  }

  async findAll(customerId: string, user: { userId: string; role: string; dealerId?: string }) {
    const where: any = { customerId };

    // Customers can only see their own docs
    // (Note: In this app, a customer user usually logs in via email matching)
    // If it's a customer person, ensure they are requesting their own ID.
    // BUT usually this is called from dashboard contexts.
    
    if (user.role === 'dealer') {
      where.dealerId = user.dealerId;
    }

    return this.prisma.customerDocument.findMany({
      where,
      include: {
        file: true,
        createdBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllDocuments() {
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
    return this.prisma.customerDocument.findMany({
      where: { dealerId },
      include: {
        file: true,
        customer: {
          select: { firstName: true, lastName: true, email: true },
        },
        createdBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllByCustomerEmail(email: string) {
    // 1. Find the customer record by email
    const customer = await this.prisma.customer.findFirst({
      where: { email },
    });

    if (!customer) return [];

    // 2. Return their documents
    return this.prisma.customerDocument.findMany({
      where: { customerId: customer.id },
      include: {
        file: true,
        createdBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(id: string, user: { userId: string; role: string; dealerId?: string }) {
    const doc = await this.prisma.customerDocument.findUnique({
      where: { id },
      include: { file: true },
    });

    if (!doc) throw new NotFoundException('Document not found');

    if (user.role === 'dealer' && doc.dealerId !== user.dealerId) {
      throw new ForbiddenException('Access denied');
    }

    // Delete database record first
    await this.prisma.customerDocument.delete({ where: { id } });

    // Delete actual file
    if (doc.fileId) {
      try {
        await this.uploadService.deleteFile(doc.fileId, user.role === 'dealer' ? user.dealerId : undefined);
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
