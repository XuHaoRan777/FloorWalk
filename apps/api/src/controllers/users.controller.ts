import {
  BadRequestException,
  ConflictException,
  Controller,
  Body,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import argon2 from 'argon2';
import {
  apiRoutePath,
  apiRoutes,
  adminUsersResponseSchema,
  createUserRequestSchema,
  resetUserPasswordRequestSchema,
  updateUserRequestSchema,
  userResponseSchema,
} from '@libs/shared';
import type { Pool, PoolClient } from 'pg';
import { AuthGuard, hashSessionId, readSessionCookie } from '../auth/auth.js';
import { DATABASE_POOL } from '../db/pool.provider.js';
import {
  assertRole,
  iso,
  type AuthedRequest,
} from '../queries/inspection-queries.js';

@Controller('api')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get(apiRoutePath(apiRoutes.listAdminUsers))
  async listUsers(@Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.listAdminUsers.roles);
    const result = await this.pool.query(
      `SELECT u.id, u.login_name AS "loginName", u.display_name AS "displayName", u.role,
         s.id AS "siteId", u.must_change_password AS "mustChangePassword",
         u.disabled_at IS NOT NULL AS disabled, u.created_at AS "createdAt",
         json_build_object('id', o.id, 'name', o.name) AS org,
         CASE WHEN s.id IS NULL THEN NULL ELSE json_build_object(
           'id', s.id, 'code', s.code, 'name', s.name,
           'active', s.deactivated_at IS NULL, 'createdAt', s.created_at
         ) END AS site
       FROM floorwalk.users u
       JOIN floorwalk.organizations o ON o.id = u.org_id
       LEFT JOIN floorwalk.sites s ON s.id = u.site_id AND s.org_id = u.org_id
       WHERE u.org_id = $1 ORDER BY u.display_name, u.id`,
      [request.user.orgId],
    );
    return adminUsersResponseSchema.parse(
      result.rows.map((row) => ({ ...row, createdAt: iso(row.createdAt) })),
    );
  }

  @Post(apiRoutePath(apiRoutes.createAdminUser))
  async createUser(@Req() request: AuthedRequest, @Body() body: unknown) {
    assertRole(request.user, ...apiRoutes.createAdminUser.roles);
    const input = createUserRequestSchema.parse(body);
    if (input.role === 'admin')
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '不能创建管理员。',
      });
    if (!input.siteId)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '店长必须绑定门店。',
      });

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (input.siteId) {
        const sites = await client.query<{ id: string }>(
          'SELECT id FROM floorwalk.sites WHERE id = $1 AND org_id = $2 FOR UPDATE',
          [input.siteId, request.user.orgId],
        );
        if (!sites.rowCount)
          throw new NotFoundException({
            code: 'NOT_FOUND',
            message: '门店不存在。',
          });
      }
      const passwordHash = await argon2.hash(input.password);
      const result = await client.query(
        `INSERT INTO floorwalk.users
           (org_id, login_name, password_hash, display_name, role, site_id,
            must_change_password, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7)
         RETURNING id`,
        [
          request.user.orgId,
          input.loginName,
          passwordHash,
          input.displayName,
          input.role,
          input.siteId ?? null,
          request.user.id,
        ],
      );
      const user = await this.getUser(
        result.rows[0].id,
        request.user.orgId,
        client,
      );
      await client.query('COMMIT');
      return user;
    } catch (error) {
      await client.query('ROLLBACK');
      if (isUniqueViolation(error))
        throw new ConflictException({
          code: 'INVALID_STATE',
          message: '该登录名已被注册。',
        });
      throw error;
    } finally {
      client.release();
    }
  }

  @Patch(apiRoutePath(apiRoutes.updateAdminUser))
  async updateUser(
    @Req() request: AuthedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    assertRole(request.user, ...apiRoutes.updateAdminUser.roles);
    const input = updateUserRequestSchema.parse(body);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (input.disabled === true && request.user.role === 'admin')
        await client.query(
          'SELECT id FROM floorwalk.organizations WHERE id = $1 FOR UPDATE',
          [request.user.orgId],
        );
      const target = await this.lockTarget(client, id, request.user.orgId);
      if (
        input.disabled === true &&
        target.role === 'admin' &&
        target.disabled_at === null
      ) {
        throw new ConflictException({
          code: 'INVALID_STATE',
          message: '不能停用商家管理员。',
        });
      }
      if (input.siteId !== undefined) {
        if (target.role !== 'store_manager')
          throw new BadRequestException({
            code: 'VALIDATION_FAILED',
            message: '只有店长可以调店。',
          });
        const site = await client.query(
          'SELECT id FROM floorwalk.sites WHERE id = $1 AND org_id = $2 FOR UPDATE',
          [input.siteId, request.user.orgId],
        );
        if (!site.rowCount)
          throw new NotFoundException({
            code: 'NOT_FOUND',
            message: '门店不存在。',
          });
      }
      const updated = await client.query(
        `UPDATE floorwalk.users SET
           display_name = COALESCE($2, display_name),
           site_id = COALESCE($5, site_id),
           disabled_at = CASE WHEN $3::boolean IS NULL THEN disabled_at
             WHEN $3 THEN COALESCE(disabled_at, now()) ELSE NULL END
         WHERE id = $1 AND org_id = $4 RETURNING id`,
        [
          id,
          input.displayName ?? null,
          input.disabled ?? null,
          request.user.orgId,
          input.siteId ?? null,
        ],
      );
      if (input.disabled === true)
        await client.query(
          'UPDATE floorwalk.sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
          [id],
        );
      const response = await this.getUser(
        updated.rows[0].id,
        request.user.orgId,
        client,
      );
      await client.query('COMMIT');
      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  @Post(apiRoutePath(apiRoutes.resetAdminUserPassword))
  @HttpCode(204)
  async resetPassword(
    @Req() request: AuthedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    assertRole(request.user, ...apiRoutes.resetAdminUserPassword.roles);
    const input = resetUserPasswordRequestSchema.parse(body);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.lockTarget(client, id, request.user.orgId);
      const passwordHash = await argon2.hash(input.password);
      await client.query(
        'UPDATE floorwalk.users SET password_hash = $2, must_change_password = true WHERE id = $1',
        [id, passwordHash],
      );
      await client.query(
        'UPDATE floorwalk.sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [id],
      );
      const response = await this.getUser(id, request.user.orgId, client);
      await client.query('COMMIT');
      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  @Post(apiRoutePath(apiRoutes.changePassword))
  @HttpCode(204)
  async changePassword(
    @Req() request: AuthedRequest,
    @Body() body: unknown,
  ): Promise<void> {
    assertRole(request.user, ...apiRoutes.changePassword.roles);
    const input = apiRoutes.changePassword.requestSchema!.parse(body);
    const currentSession = readSessionCookie(request);
    if (!currentSession)
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: '需要登录。',
      });
    const currentTokenHash = hashSessionId(currentSession);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const users = await client.query<{
        password_hash: string;
      }>(
        'SELECT password_hash FROM floorwalk.users WHERE id = $1 AND disabled_at IS NULL FOR UPDATE',
        [request.user.id],
      );
      const user = users.rows[0];
      if (
        !user ||
        !(await argon2.verify(user.password_hash, input.currentPassword))
      )
        throw new UnauthorizedException({
          code: 'UNAUTHENTICATED',
          message: '当前密码错误。',
        });
      if (await argon2.verify(user.password_hash, input.newPassword))
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: '新密码不能与当前密码相同。',
        });
      const currentSessions = await client.query(
        `SELECT 1 FROM floorwalk.sessions
         WHERE user_id = $1 AND token_hash = $2 AND revoked_at IS NULL
           AND last_seen_at > now() - interval '7 days' FOR UPDATE`,
        [request.user.id, currentTokenHash],
      );
      if (!currentSessions.rowCount)
        throw new UnauthorizedException({
          code: 'UNAUTHENTICATED',
          message: '登录凭证无效。',
        });
      const passwordHash = await argon2.hash(input.newPassword);
      await client.query(
        'UPDATE floorwalk.users SET password_hash = $2, must_change_password = false WHERE id = $1',
        [request.user.id, passwordHash],
      );
      await client.query(
        `UPDATE floorwalk.sessions SET revoked_at = now()
         WHERE user_id = $1 AND token_hash <> $2 AND revoked_at IS NULL`,
        [request.user.id, currentTokenHash],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async lockTarget(client: PoolClient, id: string, orgId: string) {
    const result = await client.query<{
      id: string;
      role: 'store_manager' | 'admin';
      site_id: string | null;
      disabled_at: Date | null;
    }>(
      'SELECT id, role, site_id, disabled_at FROM floorwalk.users WHERE id = $1 AND org_id = $2 FOR UPDATE',
      [id, orgId],
    );
    const target = result.rows[0];
    if (!target)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '账号不存在。',
      });
    return target;
  }

  private async getUser(
    id: string,
    orgId: string,
    executor: Pool | PoolClient = this.pool,
  ) {
    const result = await executor.query(
      `SELECT u.id, u.login_name AS "loginName", u.display_name AS "displayName", u.role,
         s.id AS "siteId", u.must_change_password AS "mustChangePassword",
         u.disabled_at IS NOT NULL AS disabled, u.created_at AS "createdAt",
         json_build_object('id', o.id, 'name', o.name) AS org,
         CASE WHEN s.id IS NULL THEN NULL ELSE json_build_object(
           'id', s.id, 'code', s.code, 'name', s.name,
           'active', s.deactivated_at IS NULL, 'createdAt', s.created_at
         ) END AS site
       FROM floorwalk.users u
       JOIN floorwalk.organizations o ON o.id = u.org_id
       LEFT JOIN floorwalk.sites s ON s.id = u.site_id AND s.org_id = u.org_id
       WHERE u.id = $1 AND u.org_id = $2`,
      [id, orgId],
    );
    const row = result.rows[0];
    if (!row)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '账号不存在。',
      });
    return userResponseSchema.parse({ ...row, createdAt: iso(row.createdAt) });
  }
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}
