import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import {
  apiRoutePath,
  apiRoutes,
  loginRequestSchema,
  loginResponseSchema,
  userSchema,
} from '@libs/shared';
import { createPool } from './db/client.js';
import { AuthGuard, getJwtSecret, type AuthUser } from './auth.js';
import { type AuthedRequest } from './inspection-queries.js';

@Controller('api')
export class AuthController {
  private readonly jwt = new JwtService({
    secret: getJwtSecret(),
  });

  @Post(apiRoutePath(apiRoutes.login))
  async login(@Body() body: unknown) {
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
      return loginResponseSchema.parse({
        token: this.jwt.sign(
          {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            role: user.role,
            siteId: user.siteId,
          },
          { expiresIn: '1h' },
        ),
        user,
      });
    } finally {
      await pool.end();
    }
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
