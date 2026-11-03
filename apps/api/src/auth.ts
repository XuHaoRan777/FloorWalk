import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { DATABASE_POOL } from './db/pool.provider.js';
import type { Pool } from 'pg';

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'inspector' | 'supervisor' | 'admin';
  orgId: string;
  siteId: string | null;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

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
      const result = await this.pool.query<AuthUser>(
        `UPDATE floorwalk.sessions s SET last_seen_at = now()
         FROM floorwalk.users u
         WHERE u.id = s.user_id AND s.token_hash = $1 AND s.revoked_at IS NULL
           AND s.last_seen_at > now() - interval '7 days'
         RETURNING u.id, u.email, u.display_name AS "displayName", u.role,
           u.site_id AS "siteId", u.org_id AS "orgId"`,
        [hashSessionId(sessionId)],
      );
      const user = result.rows[0];
      if (!user || !['inspector', 'supervisor', 'admin'].includes(user.role))
        throw new Error('unknown user');
      context
        .switchToHttp()
        .getResponse<Response>()
        .setHeader('Set-Cookie', sessionCookie(sessionId));
      request.user = user;
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

export function sessionCookie(value: string, maxAge = 7 * 24 * 60 * 60) {
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
