import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions('roles.view')
  @ApiOperation({ summary: 'Get all roles' })
  findAll() {
    return this.rolesService.findAll();
  }

  @Post()
  @Permissions('roles.create')
  @ApiOperation({ summary: 'Create a new role' })
  create(@Body() createRoleDto: any, @Req() req: any) {
    const ipAddress =
      req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.rolesService.create(
      createRoleDto,
      req.user.userId,
      ipAddress,
      userAgent,
    );
  }

  @Put(':id')
  @Permissions('roles.update')
  @ApiOperation({ summary: 'Update a role' })
  update(@Param('id') id: string, @Body() updateRoleDto: any, @Req() req: any) {
    const ipAddress =
      req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.rolesService.update(
      id,
      updateRoleDto,
      req.user.userId,
      ipAddress,
      userAgent,
    );
  }

  @Delete(':id')
  @Permissions('roles.delete')
  @ApiOperation({ summary: 'Delete a role' })
  remove(@Param('id') id: string, @Req() req: any) {
    const ipAddress =
      req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.rolesService.remove(id, req.user.userId, ipAddress, userAgent);
  }
}

@ApiTags('permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions('roles.view') // Reusing roles.view for permissions listing
  @ApiOperation({ summary: 'Get all permissions' })
  findAll() {
    return this.rolesService.getPermissions();
  }
}
