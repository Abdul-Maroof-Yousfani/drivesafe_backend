import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import * as fs from 'fs';
import * as path from 'path';

// Sharp import for image optimization
import sharp = require('sharp');

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
  ) {}

  /**
   * Process and save an uploaded file
   */
  async processUpload(
    file: Express.Multer.File,
    dealerId: string,
    dealerName: string,
    uploadedById: string,
    category?: string,
  ): Promise<{
    id: string;
    filename: string;
    url: string;
    size: number;
    mimetype: string;
  }> {
    // Determine category from mimetype if not provided
    const fileCategory =
      category || this.storageService.getCategoryFromMimeType(file.mimetype);

    // Get dealer storage path
    const dealerPath = this.storageService.getDealerStoragePath(
      dealerId,
      dealerName,
    );
    const categoryPath = this.storageService.getCategoryPath(
      dealerPath,
      fileCategory,
    );

    // Ensure directory exists
    if (!fs.existsSync(categoryPath)) {
      fs.mkdirSync(categoryPath, { recursive: true });
    }

    // Generate unique filename
    const newFilename = this.storageService.generateFilename(file.originalname);
    const filePath = path.join(categoryPath, newFilename);

    let finalSize = file.size;

    // Optimize images with Sharp
    if (file.mimetype.startsWith('image/') && fileCategory !== 'logos') {
      try {
        const imageBuffer = file.buffer || fs.readFileSync(file.path);
        const optimized = await sharp(imageBuffer)
          .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();

        fs.writeFileSync(filePath, optimized);
        finalSize = optimized.length;
        this.logger.log(
          `Optimized image from ${file.size} to ${finalSize} bytes`,
        );
      } catch (error) {
        this.logger.warn(
          `Image optimization failed, saving original: ${error.message}`,
        );
        // Save original if optimization fails
        if (file.buffer) {
          fs.writeFileSync(filePath, file.buffer);
        } else if (file.path) {
          fs.copyFileSync(file.path, filePath);
        }
      }
    } else {
      // For non-images, just save the file
      if (file.buffer) {
        fs.writeFileSync(filePath, file.buffer);
      } else if (file.path) {
        fs.copyFileSync(file.path, filePath);
      }
    }

    // Generate URL (relative path from public folder)
    const sanitizedName = dealerName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
    const url = `/dealers/${sanitizedName}/${fileCategory}/${newFilename}`;

    // Save to database
    const fileUpload = await this.prisma.fileUpload.create({
      data: {
        filename: newFilename,
        originalFilename: file.originalname,
        mimetype: file.mimetype,
        size: finalSize,
        path: filePath,
        url: url,
        category: fileCategory,
        dealerId: dealerId,
        createdById: uploadedById,
      },
    });

    // Update dealer storage usage
    await this.updateDealerStorageUsage(dealerId, finalSize);

    return {
      id: fileUpload.id,
      filename: fileUpload.originalFilename || fileUpload.filename,
      url: fileUpload.url || '',
      size: fileUpload.size,
      mimetype: fileUpload.mimetype,
    };
  }

  /**
   * Update dealer storage usage in database
   */
  private async updateDealerStorageUsage(
    dealerId: string,
    additionalBytes: number,
  ): Promise<void> {
    await this.prisma.dealerStorage.upsert({
      where: { dealerId },
      create: {
        dealerId,
        usedBytes: BigInt(additionalBytes),
      },
      update: {
        usedBytes: {
          increment: BigInt(additionalBytes),
        },
        lastCalculated: new Date(),
      },
    });
  }

  /**
   * Get storage usage for a dealer
   */
  async getStorageUsage(dealerId: string): Promise<{
    usedBytes: string;
    usedMB: number;
    usedGB: number;
    limitGB: number;
    percentageUsed: number;
    availableGB: number;
  }> {
    let storage = await this.prisma.dealerStorage.findUnique({
      where: { dealerId },
    });

    if (!storage) {
      // Create default storage record if not exists
      storage = await this.prisma.dealerStorage.create({
        data: {
          dealerId,
          usedBytes: BigInt(0),
        },
      });
    }

    return this.storageService.formatStorageInfo(
      storage.usedBytes,
      storage.limitBytes,
    );
  }

  /**
   * Get all files for a dealer
   */
  async getFiles(
    dealerId: string,
    category?: string,
  ): Promise<
    {
      id: string;
      filename: string;
      url: string;
      size: number;
      mimetype: string;
      category: string;
      createdAt: Date;
    }[]
  > {
    const where: any = { dealerId };
    if (category) {
      where.category = category;
    }

    const files = await this.prisma.fileUpload.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return files.map((file) => ({
      id: file.id,
      filename: file.originalFilename || file.filename,
      url: file.url || '',
      size: file.size,
      mimetype: file.mimetype,
      category: file.category,
      createdAt: file.createdAt,
    }));
  }

  /**
   * Get a single file by ID
   */
  async getFile(
    fileId: string,
    dealerId?: string,
  ): Promise<{
    id: string;
    filename: string;
    originalFilename: string;
    url: string;
    path: string;
    size: number;
    mimetype: string;
    category: string;
    createdAt: Date;
  }> {
    const where: any = { id: fileId };
    if (dealerId) {
      where.dealerId = dealerId;
    }

    const file = await this.prisma.fileUpload.findFirst({
      where,
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    return {
      id: file.id,
      filename: file.filename,
      originalFilename: file.originalFilename || file.filename,
      url: file.url || '',
      path: file.path || '',
      size: file.size,
      mimetype: file.mimetype,
      category: file.category,
      createdAt: file.createdAt,
    };
  }

  /**
   * Delete a file
   */
  async deleteFile(fileId: string, dealerId: string): Promise<void> {
    const file = await this.prisma.fileUpload.findFirst({
      where: { id: fileId, dealerId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Delete physical file
    const deletedSize = file.path
      ? await this.storageService.deleteFile(file.path)
      : 0;

    // Delete database record
    await this.prisma.fileUpload.delete({
      where: { id: fileId },
    });

    // Update storage usage
    if (deletedSize > 0) {
      await this.prisma.dealerStorage.update({
        where: { dealerId },
        data: {
          usedBytes: {
            decrement: BigInt(deletedSize),
          },
          lastCalculated: new Date(),
        },
      });
    }

    this.logger.log(`Deleted file ${fileId} for dealer ${dealerId}`);
  }
}
