import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly baseUploadPath: string;
  private readonly maxStorageBytes: bigint = BigInt(1073741824); // 1GB

  constructor(private configService: ConfigService) {
    // Base path for dealer uploads - relative to project root
    this.baseUploadPath = path.join(process.cwd(), 'public', 'dealers');
    this.ensureBaseDirectoryExists();
  }

  private ensureBaseDirectoryExists(): void {
    if (!fs.existsSync(this.baseUploadPath)) {
      fs.mkdirSync(this.baseUploadPath, { recursive: true });
      this.logger.log(`Created base upload directory: ${this.baseUploadPath}`);
    }
  }

  /**
   * Get the storage path for a dealer
   * @param dealerId Dealer UUID
   * @param dealerName Dealer business name (used for folder name)
   */
  getDealerStoragePath(dealerId: string, dealerName: string): string {
    const sanitizedName = this.sanitizeFolderName(dealerName);
    return path.join(this.baseUploadPath, sanitizedName);
  }

  /**
   * Get the master storage path for super admin uploads
   */
  getMasterStoragePath(): string {
    return path.join(process.cwd(), 'public', 'master');
  }

  /**
   * Get the subfolder path for a specific file category
   */
  getCategoryPath(dealerPath: string, category: string): string {
    const validCategories = [
      'images',
      'documents',
      'invoices',
      'logos',
      'other',
    ];
    const normalizedCategory = validCategories.includes(category.toLowerCase())
      ? category.toLowerCase()
      : 'other';
    return path.join(dealerPath, normalizedCategory);
  }

  /**
   * Create dealer storage folder structure
   */
  async createDealerStorageFolder(
    dealerId: string,
    dealerName: string,
  ): Promise<{ success: boolean; path: string }> {
    const dealerPath = this.getDealerStoragePath(dealerId, dealerName);

    try {
      // Create main dealer folder
      if (!fs.existsSync(dealerPath)) {
        fs.mkdirSync(dealerPath, { recursive: true });
        this.logger.log(`Created dealer folder: ${dealerPath}`);
      }

      // Create category subfolders
      const categories = ['images', 'documents', 'invoices', 'logos', 'other'];
      for (const category of categories) {
        const categoryPath = path.join(dealerPath, category);
        if (!fs.existsSync(categoryPath)) {
          fs.mkdirSync(categoryPath, { recursive: true });
        }
      }

      return { success: true, path: dealerPath };
    } catch (error) {
      this.logger.error(
        `Failed to create dealer storage folder: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Calculate the actual storage usage for a dealer by scanning their directory
   */
  async calculateStorageUsage(
    dealerId: string,
    dealerName: string,
  ): Promise<bigint> {
    const dealerPath = this.getDealerStoragePath(dealerId, dealerName);

    if (!fs.existsSync(dealerPath)) {
      return BigInt(0);
    }

    return this.getDirectorySize(dealerPath);
  }

  private getDirectorySize(directoryPath: string): bigint {
    let totalSize = BigInt(0);

    const files = fs.readdirSync(directoryPath);
    for (const file of files) {
      const filePath = path.join(directoryPath, file);
      const stats = fs.statSync(filePath);

      if (stats.isDirectory()) {
        totalSize += this.getDirectorySize(filePath);
      } else {
        totalSize += BigInt(stats.size);
      }
    }

    return totalSize;
  }

  /**
   * Check if dealer has enough storage space for a new file
   */
  async checkStorageLimit(
    currentUsedBytes: bigint,
    additionalBytes: number,
    limitBytes?: bigint,
  ): Promise<{
    hasSpace: boolean;
    usedBytes: bigint;
    limitBytes: bigint;
    availableBytes: bigint;
    percentageUsed: number;
  }> {
    const limit = limitBytes || this.maxStorageBytes;
    const totalAfterUpload = currentUsedBytes + BigInt(additionalBytes);
    const hasSpace = totalAfterUpload <= limit;
    const availableBytes = limit - currentUsedBytes;
    const percentageUsed =
      Number((currentUsedBytes * BigInt(10000)) / limit) / 100;

    return {
      hasSpace,
      usedBytes: currentUsedBytes,
      limitBytes: limit,
      availableBytes: availableBytes > BigInt(0) ? availableBytes : BigInt(0),
      percentageUsed,
    };
  }

  /**
   * Format storage info for API response
   */
  formatStorageInfo(
    usedBytes: bigint,
    limitBytes: bigint,
  ): {
    usedBytes: string;
    usedMB: number;
    usedGB: number;
    limitGB: number;
    percentageUsed: number;
    availableGB: number;
  } {
    const usedMB = Number(usedBytes) / (1024 * 1024);
    const usedGB = Number(usedBytes) / (1024 * 1024 * 1024);
    const limitGB = Number(limitBytes) / (1024 * 1024 * 1024);
    const percentageUsed =
      Number((usedBytes * BigInt(10000)) / limitBytes) / 100;
    const availableGB = limitGB - usedGB;

    return {
      usedBytes: usedBytes.toString(),
      usedMB: Math.round(usedMB * 100) / 100,
      usedGB: Math.round(usedGB * 1000) / 1000,
      limitGB: Math.round(limitGB * 1000) / 1000,
      percentageUsed: Math.round(percentageUsed * 100) / 100,
      availableGB: Math.round(Math.max(0, availableGB) * 1000) / 1000,
    };
  }

  /**
   * Delete a file and return its size
   */
  async deleteFile(filePath: string): Promise<number> {
    if (!fs.existsSync(filePath)) {
      return 0;
    }

    const stats = fs.statSync(filePath);
    const size = stats.size;
    fs.unlinkSync(filePath);
    this.logger.log(`Deleted file: ${filePath}`);
    return size;
  }

  /**
   * Generate a unique filename
   */
  generateFilename(originalFilename: string): string {
    const timestamp = Date.now();
    const sanitized = originalFilename.replace(/[^a-zA-Z0-9_.-]/g, '_');
    return `${timestamp}_${sanitized}`;
  }

  /**
   * Sanitize folder name for file system
   */
  private sanitizeFolderName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }

  /**
   * Get MIME type category for organizing files
   */
  getCategoryFromMimeType(mimetype: string): string {
    if (mimetype.startsWith('image/')) {
      return 'images';
    }
    if (
      mimetype === 'application/pdf' ||
      mimetype.startsWith('application/msword') ||
      mimetype.startsWith(
        'application/vnd.openxmlformats-officedocument.wordprocessingml',
      ) ||
      mimetype.startsWith('application/vnd.ms-excel') ||
      mimetype.startsWith(
        'application/vnd.openxmlformats-officedocument.spreadsheetml',
      )
    ) {
      return 'documents';
    }
    return 'other';
  }
}
