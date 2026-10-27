import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import argon2 from 'argon2';
import {
  apiRoutePath,
  apiRoutes,
  loginRequestSchema,
  loginResponseSchema,
  userSchema,
} from '@libs/shared';
import { createPool } from './db/client.js';
import {
  AuthGuard,
  hashSessionId,
  sessionCookie,
  type AuthUser,
} from './auth.js';
import { type AuthedRequest } from './inspection-queries.js';

@Controller('api')
export class AuthController {
  @Post(apiRoutePath(apiRoutes.createSession))
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = loginRequestSchema.parse(body);
    const pool = createPool();
    try {
      const result = await pool.query<{
        id: string;
        email: string;
        password_hash: string;
        display_name: string;
        role: AuthUser['role'];
        site_id: string | null;
        created_at: string;
      }>(
        'SELECT id, email, password_hash, display_name, role, site_id, created_at FROM floorwalk.users WHERE email = $1',
        [input.email],
      );
      const row = result.rows[0];
      if (!row || !(await argon2.verify(row.password_hash, input.password)))
        throw new UnauthorizedException({
          code: 'UNAUTHENTICATED',
          message: '邮箱或密码错误。',
        });
      const user = userSchema.parse({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        siteId: row.site_id,
        createdAt: new Date(row.created_at).toISOString(),
      });
      const sessionId = randomBytes(32).toString('base64url');
      await pool.query(
        `INSERT INTO floorwalk.sessions (token_hash, user_id, expires_at)
         VALUES ($1, $2, now() + interval '1 hour')`,
        [hashSessionId(sessionId), user.id],
      );
      response.setHeader('Set-Cookie', sessionCookie(sessionId));
      return loginResponseSchema.parse({ user });
    } finally {
      await pool.end();
    }
  }

  @Delete(apiRoutePath(apiRoutes.deleteSession))
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response) {
    response.setHeader('Set-Cookie', sessionCookie('', 0));
  }

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.me))
  async me(@Req() request: AuthedRequest) {
    const pool = createPool();
    try {
      const result = await pool.query<{
        id: string;
        email: string;
        display_name: string;
        role: AuthUser['role'];
        site_id: string | null;
        created_at: string;
      }>(
        'SELECT id, email, display_name, role, site_id, created_at FROM floorwalk.users WHERE id = $1',
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
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        siteId: row.site_id,
        createdAt: new Date(row.created_at).toISOString(),
      });
    } finally {
      await pool.end();
    }
  }
}
