import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWarrantyPlanLevelDto } from '../dto/create-warranty-plan-level.dto';
import { UpdateWarrantyPlanLevelDto } from '../dto/update-warranty-plan-level.dto';

@Injectable()
export class WarrantyPlanLevelService {
  private readonly logger = new Logger(WarrantyPlanLevelService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<any[]> {
    return this.prisma.warrantyPlanLevel.findMany({
      where: { status: 'active' },
      include: {
        benefits: {
          include: {
            warrantyItem: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string): Promise<any> {
    const level = await this.prisma.warrantyPlanLevel.findUnique({
      where: { id },
      include: {
        benefits: {
          include: {
            warrantyItem: true,
          },
        },
      },
    });

    if (!level) {
      throw new NotFoundException('Plan level not found');
    }

    return level;
  }

  async create(dto: CreateWarrantyPlanLevelDto): Promise<any> {
    const { name, description, benefitIds } = dto;

    const level = await this.prisma.warrantyPlanLevel.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        status: 'active',
      },
    });

    if (Array.isArray(benefitIds) && benefitIds.length > 0) {
      await this.syncBenefits(level.id, benefitIds);
    }

    this.logger.log(`Created plan level ${level.id} (${level.name})`);
    return this.findOne(level.id);
  }

  async update(id: string, dto: UpdateWarrantyPlanLevelDto): Promise<any> {
    const existing = await this.prisma.warrantyPlanLevel.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Plan level not found');
    }

    const updated = await this.prisma.warrantyPlanLevel.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name.trim() : existing.name,
        description:
          dto.description !== undefined
            ? dto.description?.trim() || null
            : existing.description,
        status: dto.status ?? existing.status,
      },
    });

    if (dto.benefitIds) {
      await this.syncBenefits(id, dto.benefitIds);
    }

    this.logger.log(`Updated plan level ${updated.id} (${updated.name})`);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.warrantyPlanLevel.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Plan level not found');
    }

    await this.prisma.warrantyPlanLevel.update({
      where: { id },
      data: { status: 'inactive' },
    });

    this.logger.log(`Soft-deleted plan level ${id}`);
  }

  private async syncBenefits(
    planLevelId: string,
    benefitIds: string[],
  ): Promise<void> {
    // Clear existing mappings
    await this.prisma.warrantyPlanLevelBenefit.deleteMany({
      where: { planLevelId },
    });

    if (!benefitIds.length) return;

    // Only connect active benefit-type items
    const items = await this.prisma.warrantyItem.findMany({
      where: {
        id: { in: benefitIds },
        type: 'benefit',
        status: 'active',
      },
      select: { id: true },
    });

    if (!items.length) return;

    await this.prisma.warrantyPlanLevelBenefit.createMany({
      data: items.map((item) => ({
        planLevelId,
        warrantyItemId: item.id,
      })),
      skipDuplicates: true,
    });
  }
}
