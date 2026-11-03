import {
  Body,
  ConflictException,
  Controller,
  Inject,
  Post,
  Res,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { Response } from 'express';
import type { Pool } from 'pg';
import {
  apiRoutePath,
  apiRoutes,
  createOrgRequestSchema,
  createOrgResponseSchema,
} from '@libs/shared';
import { hashSessionId, sessionCookie } from './auth.js';
import { DATABASE_POOL } from './db/pool.provider.js';

@Controller('api')
export class OrgsController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Post(apiRoutePath(apiRoutes.createOrg))
  async createOrg(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = createOrgRequestSchema.parse(body);
    const passwordHash = await argon2.hash(input.password);
    const sessionId = randomBytes(32).toString('base64url');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const orgResult = await client.query<{
        id: string;
        name: string;
        timezone: string;
        created_at: Date;
      }>(
        `INSERT INTO floorwalk.organizations (name, timezone)
         VALUES ($1, $2) RETURNING *`,
        [input.orgName, input.timezone ?? 'Asia/Shanghai'],
      );
      const org = orgResult.rows[0];
      const userResult = await client.query<{
        id: string;
        email: string;
        display_name: string;
        created_at: Date;
      }>(
        `INSERT INTO floorwalk.users (org_id, email, password_hash, display_name, role)
         VALUES ($1, $2, $3, $4, 'admin') RETURNING *`,
        [org.id, input.email, passwordHash, input.adminName],
      );
      const user = userResult.rows[0];
      await client.query(
        `INSERT INTO floorwalk.sessions (token_hash, user_id, expires_at)
         VALUES ($1, $2, now() + interval '7 days')`,
        [hashSessionId(sessionId), user.id],
      );
      const result = createOrgResponseSchema.parse({
        org: {
          id: org.id,
          name: org.name,
          timezone: org.timezone,
          createdAt: org.created_at.toISOString(),
        },
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          role: 'admin',
          siteId: null,
          org: { id: org.id, name: org.name },
          mustChangePassword: false,
          createdAt: user.created_at.toISOString(),
        },
      });
      await client.query('COMMIT');
      response.setHeader('Set-Cookie', sessionCookie(sessionId));
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === '23505' &&
        'constraint' in error &&
        error.constraint === 'users_email_unique'
      )
        throw new ConflictException({
          code: 'INVALID_STATE',
          message: '该邮箱已被注册。',
        });
      throw error;
    } finally {
      client.release();
    }
  }
}
