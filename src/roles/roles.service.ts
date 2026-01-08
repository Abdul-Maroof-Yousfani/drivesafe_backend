import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../common/services/activity-log.service';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

@Injectable()
export class RolesService {
  constructor(
    private prisma: PrismaService,
    private activityLogService: ActivityLogService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  async findAll() {
    return this.prisma.role.findMany({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(
    createRoleDto: any,
    userId: string,
    ipAddress: string,
    userAgent: string,
  ) {
    const { name, description, permissionIds } = createRoleDto;

    const role = await this.prisma.role.create({
      data: {
        name,
        description,
        permissions: {
          create: permissionIds?.map((id) => ({ permissionId: id })) || [],
        },
      },
      include: { permissions: { include: { permission: true } } },
    });

    await this.activityLogService.log({
      userId,
      action: 'create',
      module: 'roles',
      entity: 'Role',
      entityId: role.id,
      description: `Created role: ${name}`,
      ipAddress,
      userAgent,
    });

    return role;
  }

  async update(
    id: string,
    updateRoleDto: any,
    userId: string,
    ipAddress: string,
    userAgent: string,
  ) {
    const { name, description, permissionIds } = updateRoleDto;

    const oldRole = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: true },
    });

    if (!oldRole) throw new NotFoundException('Role not found');
    if (oldRole.isSystem)
      throw new ForbiddenException('Cannot modify system role');

    await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });

    const role = await this.prisma.role.update({
      where: { id },
      data: {
        name,
        description,
        permissions: {
          create: permissionIds?.map((pid) => ({ permissionId: pid })) || [],
        },
      },
      include: { permissions: { include: { permission: true } } },
    });

    await this.activityLogService.log({
      userId,
      action: 'update',
      module: 'roles',
      entity: 'Role',
      entityId: id,
      description: `Updated role: ${name}`,
      ipAddress,
      userAgent,
    });

    return role;
  }

  async remove(
    id: string,
    userId: string,
    ipAddress: string,
    userAgent: string,
  ) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem)
      throw new ForbiddenException('Cannot delete system role');

    await this.prisma.role.delete({ where: { id } });

    await this.activityLogService.log({
      userId,
      action: 'delete',
      module: 'roles',
      entity: 'Role',
      entityId: id,
      description: `Deleted role: ${role.name}`,
      ipAddress,
      userAgent,
    });

    return { message: 'Role deleted' };
  }

  async getPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
  }
}
