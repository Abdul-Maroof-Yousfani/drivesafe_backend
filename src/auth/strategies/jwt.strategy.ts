import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_ACCESS_SECRET') || 'your-access-secret', // Fallback for dev
    });
    console.log(
      '[JwtStrategy] Initialized with secret:',
      configService.get<string>('JWT_ACCESS_SECRET')
        ? 'FOUND'
        : 'USING DEFAULT',
    );
  }

  async validate(payload: any) {
    if (!payload.userId) {
      console.error('[JwtStrategy] Invalid payload:', payload);
      throw new UnauthorizedException();
    }
    const dealerId = payload.tenantId || payload.dealerId;
    return {
      sub: payload.userId,
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId,
      dealerId: dealerId,
    };
  }
}
