import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Req,
  Res,
  HttpStatus,
  PayloadTooLargeException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UploadService } from './upload.service';
import { StorageService } from './storage.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Request } from 'express';
import * as express from 'express';
import * as fs from 'fs';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';

interface RequestWithUser extends Request {
  user: {
    sub: string;
    email: string;
    role: string;
    dealerId?: string;
    dealerName?: string;
  };
}

@ApiTags('Upload')
@ApiBearerAuth()
@Controller('upload')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Upload a single file
   */
  @Post('single')
  @Roles('dealer', 'super_admin')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
      fileFilter: (req, file, cb) => {
        // Allow common file types
        const allowedMimes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('File type not allowed'), false);
        }
      },
    }),
  )
  @ApiOperation({ summary: 'Upload a single file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        category: {
          type: 'string',
          enum: ['images', 'documents', 'invoices', 'logos', 'other'],
        },
      },
    },
  })
  async uploadSingle(
    @UploadedFile() file: Express.Multer.File,
    @Query('category') category: string,
    @Req() req: RequestWithUser,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Get dealer info
    const dealerInfo = await this.getDealerInfo(req);
    if (!dealerInfo) {
      throw new BadRequestException(
        'Dealer information not found. Only dealers can upload files.',
      );
    }

    // Check storage limit
    const storageCheck = await this.checkStorageLimit(dealerInfo.id, file.size);
    if (!storageCheck.hasSpace) {
      throw new PayloadTooLargeException({
        status: false,
        message: `Storage limit exceeded. You have used ${storageCheck.percentageUsed.toFixed(1)}% (${(Number(storageCheck.usedBytes) / (1024 * 1024 * 1024)).toFixed(2)} GB) of your 1GB limit.`,
        storageInfo: {
          used: Number(storageCheck.usedBytes) / (1024 * 1024 * 1024),
          limit: Number(storageCheck.limitBytes) / (1024 * 1024 * 1024),
          percentageUsed: storageCheck.percentageUsed,
          available: Number(storageCheck.availableBytes) / (1024 * 1024 * 1024),
        },
      });
    }

    const result = await this.uploadService.processUpload(
      file,
      dealerInfo.id,
      dealerInfo.name,
      req.user.sub,
      category,
    );

    return {
      status: true,
      data: result,
    };
  }

  /**
   * Upload multiple files
   */
  @Post('multiple')
  @Roles('dealer', 'super_admin')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
      fileFilter: (req, file, cb) => {
        const allowedMimes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('File type not allowed'), false);
        }
      },
    }),
  )
  @ApiOperation({ summary: 'Upload multiple files (max 10)' })
  @ApiConsumes('multipart/form-data')
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @Query('category') category: string,
    @Req() req: RequestWithUser,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    const dealerInfo = await this.getDealerInfo(req);
    if (!dealerInfo) {
      throw new BadRequestException(
        'Dealer information not found. Only dealers can upload files.',
      );
    }

    // Check total size
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const storageCheck = await this.checkStorageLimit(dealerInfo.id, totalSize);
    if (!storageCheck.hasSpace) {
      throw new PayloadTooLargeException({
        status: false,
        message: `Storage limit exceeded. Required: ${(totalSize / (1024 * 1024)).toFixed(2)} MB, Available: ${(Number(storageCheck.availableBytes) / (1024 * 1024)).toFixed(2)} MB`,
        storageInfo: {
          used: Number(storageCheck.usedBytes) / (1024 * 1024 * 1024),
          limit: Number(storageCheck.limitBytes) / (1024 * 1024 * 1024),
          percentageUsed: storageCheck.percentageUsed,
          available: Number(storageCheck.availableBytes) / (1024 * 1024 * 1024),
        },
      });
    }

    const results: Array<{
      id: string;
      filename: string;
      url: string;
      size: number;
      mimetype: string;
    }> = [];
    for (const file of files) {
      const result = await this.uploadService.processUpload(
        file,
        dealerInfo.id,
        dealerInfo.name,
        req.user.sub,
        category,
      );
      results.push(result);
    }

    return {
      status: true,
      data: results,
      count: results.length,
    };
  }

  /**
   * List uploaded files
   */
  @Get()
  @Roles('dealer', 'super_admin')
  @ApiOperation({ summary: 'List uploaded files' })
  async listFiles(
    @Query('category') category: string,
    @Req() req: RequestWithUser,
  ) {
    const dealerInfo = await this.getDealerInfo(req);
    if (!dealerInfo) {
      throw new BadRequestException('Dealer information not found');
    }

    const files = await this.uploadService.getFiles(dealerInfo.id, category);

    return {
      status: true,
      data: files,
      count: files.length,
    };
  }

  /**
   * Get file metadata
   */
  @Get(':id')
  @Roles('dealer', 'super_admin')
  @ApiOperation({ summary: 'Get file metadata by ID' })
  async getFile(@Param('id') id: string, @Req() req: RequestWithUser) {
    const dealerInfo = await this.getDealerInfo(req);
    const file = await this.uploadService.getFile(id, dealerInfo?.id);

    return {
      status: true,
      data: file,
    };
  }

  /**
   * Download file
   */
  @Get(':id/download')
  @Roles('dealer', 'super_admin')
  @ApiOperation({ summary: 'Download a file' })
  async downloadFile(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
    @Res() res: express.Response,
  ) {
    const dealerInfo = await this.getDealerInfo(req);
    const file = await this.uploadService.getFile(id, dealerInfo?.id);

    if (!file.path || !fs.existsSync(file.path)) {
      return res.status(HttpStatus.NOT_FOUND).json({
        status: false,
        message: 'File not found on disk',
      });
    }

    res.download(file.path, file.originalFilename);
  }

  /**
   * Delete file
   */
  @Delete(':id')
  @Roles('dealer', 'super_admin')
  @ApiOperation({ summary: 'Delete a file' })
  async deleteFile(@Param('id') id: string, @Req() req: RequestWithUser) {
    const dealerInfo = await this.getDealerInfo(req);
    if (!dealerInfo) {
      throw new BadRequestException('Dealer information not found');
    }

    await this.uploadService.deleteFile(id, dealerInfo.id);

    return {
      status: true,
      message: 'File deleted successfully',
    };
  }

  /**
   * Get storage usage
   */
  @Get('storage/usage')
  @Roles('dealer', 'super_admin')
  @ApiOperation({ summary: 'Get storage usage for current dealer' })
  async getStorageUsage(@Req() req: RequestWithUser) {
    const dealerInfo = await this.getDealerInfo(req);
    if (!dealerInfo) {
      throw new BadRequestException('Dealer information not found');
    }

    const usage = await this.uploadService.getStorageUsage(dealerInfo.id);

    return {
      status: true,
      data: usage,
    };
  }

  /**
   * Helper: Get dealer info from request
   */
  private async getDealerInfo(
    req: RequestWithUser,
  ): Promise<{ id: string; name: string } | null> {
    // If user is a dealer, get their dealer info
    if (req.user.role === 'dealer' && req.user.dealerId) {
      const dealer = await this.prisma.dealer.findUnique({
        where: { id: req.user.dealerId },
        select: { id: true, businessNameLegal: true },
      });
      if (dealer) {
        return { id: dealer.id, name: dealer.businessNameLegal };
      }
    }

    // If super_admin, check if dealerId is provided in query
    if (req.user.role === 'super_admin') {
      const dealerId = req.query.dealerId as string;
      if (dealerId) {
        const dealer = await this.prisma.dealer.findUnique({
          where: { id: dealerId },
          select: { id: true, businessNameLegal: true },
        });
        if (dealer) {
          return { id: dealer.id, name: dealer.businessNameLegal };
        }
      }
    }

    return null;
  }

  /**
   * Helper: Check storage limit
   */
  private async checkStorageLimit(
    dealerId: string,
    additionalBytes: number,
  ): Promise<{
    hasSpace: boolean;
    usedBytes: bigint;
    limitBytes: bigint;
    availableBytes: bigint;
    percentageUsed: number;
  }> {
    let storage = await this.prisma.dealerStorage.findUnique({
      where: { dealerId },
    });

    if (!storage) {
      storage = await this.prisma.dealerStorage.create({
        data: {
          dealerId,
          usedBytes: BigInt(0),
        },
      });
    }

    return this.storageService.checkStorageLimit(
      storage.usedBytes,
      additionalBytes,
      storage.limitBytes,
    );
  }
}
