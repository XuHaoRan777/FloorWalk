import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { createPool } from './db/client.js';

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'inspector' | 'supervisor' | 'hq';
  siteId: string | null;
};

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET 未配置。');
  return secret;
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly jwt = new JwtService({ secret: getJwtSecret() });

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer '))
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: '需要登录。',
      });
    try {
      const claims = this.jwt.verify<Pick<AuthUser, 'id'>>(header.slice(7), {
        secret: getJwtSecret(),
      });
      const pool = createPool();
      try {
        const result = await pool.query<AuthUser>(
          'SELECT id, email, display_name AS "displayName", role, site_id AS "siteId" FROM floorwalk.users WHERE id = $1',
          [claims.id],
        );
        const user = result.rows[0];
        if (!user || !['inspector', 'supervisor', 'hq'].includes(user.role))
          throw new Error('unknown user');
        request.user = user;
      } finally {
        await pool.end();
      }
      return true;
    } catch {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: '登录凭证无效。',
      });
    }
  }
}

export function requireRole(...roles: AuthUser['role'][]) {
  return (user: AuthUser | undefined) => {
    if (!user || !roles.includes(user.role))
      throw new (class extends Error {})('FORBIDDEN');
  };
}
