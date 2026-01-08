import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from '../auth.service';
import { Response } from 'express';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private authService: AuthService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      // 1. Try standard authentication
      const result = (await super.canActivate(context)) as boolean;
      if (result) {
        const request = context.switchToHttp().getRequest();
        // Ensure strict portal access
        this.authService.validatePortalAccess(
          request.user?.role,
          request.headers,
        );
      }
      return result;
    } catch (err: any) {
      // 2. Catch TokenExpiredError
      // Note: Passport-JWT might throw UnauthorizedException or Return false.
      // We need to check if the error is related to expiration.
      // Often the error message or info contains "jwt expired".

      const request = context.switchToHttp().getRequest();
      const response: Response = context.switchToHttp().getResponse();

      // Attempt to find refresh token
      // Note: Parse cookies if needed, or rely on request.cookies if middleware exists
      // Assuming cookie-parser or similar populates request.cookies
      const refreshToken =
        request.cookies?.['refreshToken'] || request.headers['x-refresh-token'];

      if (refreshToken) {
        try {
          // 3. Attempt Refresh
          const {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            user,
          } = await this.authService.refreshToken(refreshToken);

          // 4. Attach user to request
          request.user = user;

          // 4b. Validate Portal Access immediately after refresh
          this.authService.validatePortalAccess(user.role, request.headers);

          // 5. Set Response Headers
          response.setHeader('X-New-Access-Token', newAccessToken);
          response.setHeader('X-New-Refresh-Token', newRefreshToken);

          // 6. Set Cookies (if applicable)
          // Check if response.cookie exists (Express)
          if (typeof response.cookie === 'function') {
            response.cookie('accessToken', newAccessToken, {
              httpOnly: true,
              secure: false, // process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: 2 * 60 * 60 * 1000, // 2 hours
              path: '/',
            });
            response.cookie('refreshToken', newRefreshToken, {
              httpOnly: true,
              secure: false, // process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: 7 * 24 * 60 * 60 * 1000,
              path: '/',
            });
          }

          return true;
        } catch (refreshErr) {
          // Refresh failed, throw original error
          throw err;
        }
      }
      throw err;
    }
  }

  handleRequest(err, user, info, context, status) {
    if (info && info.name === 'TokenExpiredError') {
      // Throw to be caught by canActivate
      throw new UnauthorizedException('Token expired');
    }
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }
}
