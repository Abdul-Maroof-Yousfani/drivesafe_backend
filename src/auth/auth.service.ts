import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ActivityLogService } from '../common/services/activity-log.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private activityLogService: ActivityLogService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  private parseExpiryToMs(expiryString: string): number {
    const match = expiryString.match(/^(\d+)([smhd])$/);
    if (!match) return 30 * 24 * 60 * 60 * 1000;
    const value = parseInt(match[1]);
    const unit = match[2];
    const multipliers: any = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return value * (multipliers[unit] || multipliers.d);
  }

  public validatePortalAccess(role: string | null | undefined, headers: any) {
    if (!headers) return;

    const host = headers['x-forwarded-host'] || headers['host'] || '';

    if (!host) return;

    let portalType = 'admin';
    if (host.startsWith('dealer.')) portalType = 'dealer';
    else if (host.startsWith('customer.')) portalType = 'customer';

    const userRole = role;

    if (portalType === 'dealer') {
      if (userRole !== 'dealer') {
        throw new ForbiddenException(
          'Access Denied: You do not have permission to access this portal.',
        );
      }
    } else if (portalType === 'customer') {
      if (userRole !== 'customer') {
        throw new ForbiddenException(
          'Access Denied: You do not have permission to access this portal.',
        );
      }
    } else if (portalType === 'admin') {
      if (userRole === 'dealer' || userRole === 'customer') {
        throw new ForbiddenException(
          'Access Denied: You do not have permission to access this portal.',
        );
      }
    }
  }

  private generateTokens(
    user: any,
    tokenFamily: string | null = null,
    tenantId: string | null = null,
  ) {
    const family = tokenFamily || crypto.randomUUID();
    const payload: any = {
      userId: user.id,
      email: user.email,
      roleId: user.roleId,
      role: user.role?.name || null,
    };
    if (tenantId) payload.tenantId = tenantId;

    const accessToken = this.jwtService.sign(payload);

    // We manually sign refresh token to use a different secret/expiry if needed,
    // but usually standard JwtService setup covers access token.
    // Here we explicitly use the refresh secret from config.
    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      'your-refresh-secret';
    const refreshExpiresIn =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d';

    const refreshToken = this.jwtService.sign(
      { userId: user.id, family, tenantId },
      { secret: refreshSecret, expiresIn: refreshExpiresIn as any },
    );

    return { accessToken, refreshToken, family };
  }

  private parseDealerDetails(dealer: any) {
    if (!dealer) return dealer;
    if (typeof dealer.bankDetails === 'string') {
      try {
        dealer.bankDetails = JSON.parse(dealer.bankDetails);
      } catch (e) {}
    }
    if (typeof dealer.authorizedSignatory === 'string') {
      try {
        dealer.authorizedSignatory = JSON.parse(dealer.authorizedSignatory);
      } catch (e) {}
    }
    return dealer;
  }

  async getUserDetails(user: any) {
    if (user.role?.name !== 'dealer' && user.role?.name !== 'customer')
      return null;

    if (user.role?.name === 'dealer') {
      const dealer = await this.prisma.dealer.findUnique({
        where: { email: user.email },
      });
      return this.parseDealerDetails(dealer);
    } else {
      return this.prisma.customer.findFirst({
        where: { email: user.email },
        orderBy: { createdAt: 'desc' },
      });
    }
  }

  async register(registerDto: RegisterDto) {
    const { email, password, firstName, lastName, phone, roleId } = registerDto;

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) throw new BadRequestException('Email already registered');

    const saltRounds = parseInt(
      this.configService.get('PASSWORD_SALT_ROUNDS') || '10',
    );
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone,
        roleId,
      },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });

    // TODO: Send welcome email (Skipped as per confirmed plan)

    await this.activityLogService.log({
      userId: user.id,
      action: 'register',
      module: 'auth',
      description: `New user registered: ${email}`,
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  async login(
    loginDto: LoginDto,
    ipAddress: string,
    userAgent: string,
    headers: any,
  ) {
    const { email, password } = loginDto;

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });

    if (!user) {
      await this.activityLogService.log({
        action: 'login',
        module: 'auth',
        ipAddress,
        userAgent,
        status: 'failure',
        errorMessage: 'User not found',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Strict Portal Check
    this.validatePortalAccess(user.role?.name, headers);

    if (user.status !== 'active')
      throw new ForbiddenException('Account is not active');

    // Check lock status
    if (user.lockedUntil && new Date() < user.lockedUntil) {
      throw new ForbiddenException(
        `Account is locked until ${user.lockedUntil}`,
      );
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      await this.activityLogService.logLogin(
        user.id,
        ipAddress,
        userAgent,
        'failed',
        'Invalid password',
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset failed attempts (Logic to come with advanced locking, for now basic reset)
    // await this.securityService.resetFailedAttempts(user.id);

    let tenantId: string | null = null;
    if (user.role?.name === 'dealer') {
      const dealer = await this.prisma.dealer.findUnique({
        where: { email: user.email },
        select: { id: true },
      });
      if (dealer) tenantId = dealer.id;
    }

    const { accessToken, refreshToken, family } = this.generateTokens(
      user,
      null,
      tenantId,
    );

    const refreshExpiresMs = this.parseExpiryToMs(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        family,
        expiresAt: new Date(Date.now() + refreshExpiresMs),
      },
    });

    const sessionTimeout = parseInt(
      this.configService.get('SESSION_TIMEOUT_MS') || '86400000',
    );
    await this.prisma.session.create({
      data: {
        userId: user.id,
        token: accessToken,
        ipAddress,
        userAgent,
        expiresAt: new Date(Date.now() + sessionTimeout),
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ipAddress },
    });

    await this.activityLogService.logLogin(
      user.id,
      ipAddress,
      userAgent,
      'success',
    );

    const permissions =
      user.role?.permissions?.map((rp) => rp.permission.name) || [];
    const details = await this.getUserDetails(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role?.name || null,
        avatar: user.avatar,
        permissions,
        mustChangePassword: user.mustChangePassword || false,
        details,
      },
      accessToken,
      refreshToken,
    };
  }

  async refreshToken(refreshToken: string) {
    if (!refreshToken)
      throw new UnauthorizedException('Refresh token required');

    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      'your-refresh-secret';
    let decoded: any;
    try {
      decoded = this.jwtService.verify(refreshToken, { secret: refreshSecret });
    } catch (e) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });
    if (
      !storedToken ||
      storedToken.isRevoked ||
      new Date() > storedToken.expiresAt
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });

    if (!user || user.status !== 'active')
      throw new UnauthorizedException('User not found or inactive');

    // Revoke old token
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true },
    });

    // Maintain Tenant ID logic
    let tenantId = decoded.tenantId;
    if (!tenantId && user.role?.name === 'dealer') {
      const dealer = await this.prisma.dealer.findUnique({
        where: { email: user.email },
        select: { id: true },
      });
      if (dealer) tenantId = dealer.id;
    }

    const {
      accessToken,
      refreshToken: newRefreshToken,
      family,
    } = this.generateTokens(user, decoded.family, tenantId);

    const refreshExpiresMs = this.parseExpiryToMs(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: newRefreshToken,
        family: family,
        expiresAt: new Date(Date.now() + refreshExpiresMs),
      },
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        sub: user.id,
        userId: user.id,
        email: user.email,
        roleId: user.roleId,
        role: user.role?.name || null,
        tenantId: tenantId,
        dealerId: tenantId,
      },
    };
  }

  async logout(
    userId: string,
    token: string,
    ipAddress: string,
    userAgent: string,
  ) {
    if (token) {
      await this.prisma.session.updateMany({
        where: { token, userId },
        data: { isActive: false },
      });
    }
    await this.activityLogService.logLogout(userId, ipAddress, userAgent);
    return { message: 'Logged out successfully' };
  }

  async getUserProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });

    if (!user) throw new BadRequestException('User not found');

    const permissions =
      user.role?.permissions?.map((rp) => rp.permission.name) || [];
    const details = await this.getUserDetails(user);

    return { ...user, permissions, details };
  }
}
