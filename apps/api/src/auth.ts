import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
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
  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const sessionId = readSessionCookie(request);
    if (!sessionId)
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: '需要登录。',
      });
    try {
      const pool = createPool();
      try {
        const result = await pool.query<AuthUser>(
          `SELECT u.id, u.email, u.display_name AS "displayName", u.role, u.site_id AS "siteId"
           FROM floorwalk.sessions s JOIN floorwalk.users u ON u.id = s.user_id
           WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
          [hashSessionId(sessionId)],
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

export function readSessionCookie(request: Request) {
  return request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('fw_session='))
    ?.slice('fw_session='.length);
}

export function hashSessionId(sessionId: string) {
  return createHash('sha256').update(sessionId).digest('hex');
}

export function sessionCookie(value: string, maxAge = 3600) {
  return `fw_session=${value}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

export function requireRole(...roles: AuthUser['role'][]) {
  return (user: AuthUser | undefined) => {
    if (!user || !roles.includes(user.role))
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '当前角色无权执行此操作。',
      });
  };
}
