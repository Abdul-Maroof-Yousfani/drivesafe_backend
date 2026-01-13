import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWarrantyItemDto } from '../dto/create-warranty-item.dto';

@Injectable()
export class WarrantyItemService {
  private readonly logger = new Logger(WarrantyItemService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get all warranty items (benefits/features)
   * Seeds default items if none exist
   */
  async findAll(): Promise<any[]> {
    try {
      const existing = await this.prisma.warrantyItem.findMany({
        where: { status: 'active' },
        orderBy: [{ type: 'asc' }, { label: 'asc' }],
      });

      if (existing.length > 0) {
        return existing;
      }

      // Seed default warranty items
      const defaults = [
        'Comprehensive mechanical and electrical coverage',
        'Full engine and transmission protection',
        'Turbocharger and fuel system components',
        'ABS, sensors and ECUs',
        'Hybrid and electric vehicle components',
        'Enhanced wear and tear coverage',
        'Highest labour contribution',
        'Core mechanical and electrical component cover',
        'Manual and automatic gearbox cover',
        'Engine internal components',
        'Cooling system components',
        'Essential electrical parts',
        'Wear and tear covered where listed',
        'Free MOT contribution up to £40',
        'Breakdown cover (subject to availability)',
      ];

      const created = await this.prisma.$transaction(
        defaults.map((label) =>
          this.prisma.warrantyItem.create({
            data: { label, type: 'benefit', status: 'active' },
          }),
        ),
      );

      this.logger.log(`Seeded ${created.length} default warranty items`);
      return created;
    } catch (error) {
      this.logger.error(`Failed to fetch warranty items: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new warranty item (benefit/feature)
   */
  async create(dto: CreateWarrantyItemDto): Promise<any> {
    const { label, type = 'benefit', description } = dto;

    const item = await this.prisma.warrantyItem.create({
      data: {
        label: label.trim(),
        type,
        description: description?.trim() || null,
        status: 'active',
      },
    });

    this.logger.log(`Created warranty item ${item.id} (${item.label})`);
    return item;
  }
}
