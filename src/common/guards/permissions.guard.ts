import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new UnauthorizedException('Not authenticated');
    }

    // Fetch full user with permissions if not already present in request
    // Optimization: Request object might only have userId, email, role name.
    // We need actual permission list.

    // In optimized setup, AuthGuard might attach permissions.
    // If not, we fetch from DB.

    // For now, let's assume we need to fetch
    const userWithPermissions = await this.prisma.user.findUnique({
      where: { id: user.userId },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!userWithPermissions || !userWithPermissions.role) {
      throw new ForbiddenException('No role assigned');
    }

    const userPermissionNames = userWithPermissions.role.permissions.map(
      (rp) => rp.permission.name,
    );

    const hasPermission = requiredPermissions.some((permission) =>
      userPermissionNames.includes(permission),
    );

    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
