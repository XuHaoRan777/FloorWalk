import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  HttpCode,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import argon2 from 'argon2';
import {
  apiRoutePath,
  apiRoutes,
  loginRequestSchema,
  loginResponseSchema,
  userSchema,
} from '@libs/shared';
import { DATABASE_POOL } from '../db/pool.provider.js';
import type { Pool } from 'pg';
import {
  AuthGuard,
  hashSessionId,
  readSessionCookie,
  sessionCookie,
  type AuthUser,
} from '../auth/auth.js';
import { type AuthedRequest } from '../queries/inspection-queries.js';

const dummyPasswordHash =
  '$argon2id$v=19$m=65536,t=3,p=4$Ba6wlrKFzsrY3N1sAQcKbA$PB60152pm8Qtu2UQupk0i+KR+NP7Qg5Iyda+j4yWSpI';

@Controller('api')
export class AuthController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Post(apiRoutePath(apiRoutes.createSession))
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = loginRequestSchema.parse(body);
    const result = await this.pool.query<{
      id: string;
      login_name: string;
      password_hash: string;
      display_name: string;
      role: AuthUser['role'];
      site_id: string | null;
      created_at: string;
      org_id: string;
      org_name: string;
      must_change_password: boolean;
      disabled_at: Date | null;
    }>(
      `SELECT u.*, o.name AS org_name FROM floorwalk.users u JOIN floorwalk.organizations o ON o.id = u.org_id WHERE u.login_name = $1 AND u.disabled_at IS NULL ORDER BY o.name, o.id`,
      [input.loginName],
    );
    if (result.rows.length === 0)
      await argon2.verify(dummyPasswordHash, input.password);
    const matches = (
      await Promise.all(
        result.rows.map(async (row) =>
          (await argon2.verify(row.password_hash, input.password)) ? row : null,
        ),
      )
    ).filter((row) => row !== null);
    const row = input.orgId
      ? matches.find((match) => match.org_id === input.orgId)
      : matches.length === 1
        ? matches[0]
        : undefined;
    if (!input.orgId && matches.length > 1)
      return loginResponseSchema.parse({
        organizations: matches.map((match) => ({
          id: match.org_id,
          name: match.org_name,
        })),
      });
    if (!row)
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: '登录名或密码错误。',
      });
    const user = userSchema.parse({
      id: row.id,
      loginName: row.login_name,
      displayName: row.display_name,
      role: row.role,
      siteId: row.site_id,
      org: { id: row.org_id, name: row.org_name },
      mustChangePassword: row.must_change_password,
      createdAt: new Date(row.created_at).toISOString(),
    });
    const sessionId = randomBytes(32).toString('base64url');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<{
        password_hash: string;
        disabled_at: Date | null;
      }>(
        'SELECT password_hash, disabled_at FROM floorwalk.users WHERE id = $1 FOR UPDATE',
        [user.id],
      );
      if (
        !current.rows[0] ||
        current.rows[0].disabled_at ||
        current.rows[0].password_hash !== row.password_hash
      )
        throw new UnauthorizedException({
          code: 'UNAUTHENTICATED',
          message: '登录名或密码错误。',
        });
      await client.query(
        `INSERT INTO floorwalk.sessions (token_hash, user_id, expires_at)
         VALUES ($1, $2, now() + interval '7 days')`,
        [hashSessionId(sessionId), user.id],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    response.setHeader('Set-Cookie', sessionCookie(sessionId));
    return loginResponseSchema.parse({ user });
  }

  @Delete(apiRoutePath(apiRoutes.deleteSession))
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const sessionId = readSessionCookie(request);
    if (sessionId) {
      await this.pool.query(
        'UPDATE floorwalk.sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
        [hashSessionId(sessionId)],
      );
    }
    response.setHeader('Set-Cookie', sessionCookie('', 0));
  }

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.me))
  async me(@Req() request: AuthedRequest) {
    const result = await this.pool.query<{
      id: string;
      login_name: string;
      display_name: string;
      role: AuthUser['role'];
      site_id: string | null;
      created_at: string;
      org_id: string;
      org_name: string;
      must_change_password: boolean;
    }>(
      `SELECT u.*, o.name AS org_name FROM floorwalk.users u JOIN floorwalk.organizations o ON o.id = u.org_id WHERE u.id = $1`,
      [request.user.id],
    );
    const row = result.rows[0];
    if (!row)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '用户不存在。',
      });
    return userSchema.parse({
      id: row.id,
      loginName: row.login_name,
      displayName: row.display_name,
      role: row.role,
      siteId: row.site_id,
      org: { id: row.org_id, name: row.org_name },
      mustChangePassword: row.must_change_password,
      createdAt: new Date(row.created_at).toISOString(),
    });
  }
}
