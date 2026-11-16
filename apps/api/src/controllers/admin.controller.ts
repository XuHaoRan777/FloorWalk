import {
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  apiRoutePath,
  apiRoutes,
  adminSitesResponseSchema,
  createSiteRequestSchema,
  siteResponseSchema,
  updateSiteRequestSchema,
} from '@libs/shared';
import type { Pool } from 'pg';
import { AuthGuard } from '../auth/auth.js';
import { DATABASE_POOL } from '../db/pool.provider.js';
import {
  assertRole,
  iso,
  type AuthedRequest,
} from '../queries/inspection-queries.js';

@Controller('api')
export class AdminController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.listAdminSites))
  async listSites(@Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.listAdminSites.roles);
    const result = await this.pool.query(
      `SELECT s.id, s.code, s.name, s.deactivated_at IS NULL AS active,
          s.created_at AS "createdAt", COALESCE((SELECT json_agg(
            json_build_object('id', u.id, 'displayName', u.display_name)
            ORDER BY u.display_name, u.id) FROM floorwalk.users u
            WHERE u.org_id = s.org_id AND u.site_id = s.id AND u.role = 'store_manager'), '[]'::json) AS "storeManagers"
       FROM floorwalk.sites s
       WHERE s.org_id = $1
       ORDER BY s.code`,
      [request.user.orgId],
    );
    return adminSitesResponseSchema.parse(
      result.rows.map((row) => ({ ...row, createdAt: iso(row.createdAt) })),
    );
  }

  @UseGuards(AuthGuard)
  @Post(apiRoutePath(apiRoutes.createAdminSite))
  async createSite(@Body() body: unknown, @Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.createAdminSite.roles);
    const input = createSiteRequestSchema.parse(body);
    try {
      const result = await this.pool.query(
        `INSERT INTO floorwalk.sites (code, name, org_id)
         VALUES ($1, $2, $3)
         RETURNING id, code, name, deactivated_at IS NULL AS active,
           created_at AS "createdAt"`,
        [input.code, input.name, request.user.orgId],
      );
      return siteResponseSchema.parse({
        ...result.rows[0],
        createdAt: iso(result.rows[0].createdAt),
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException({
          code: 'INVALID_STATE',
          message: '门店编码已存在。',
        });
      throw error;
    }
  }

  @UseGuards(AuthGuard)
  @Patch(apiRoutePath(apiRoutes.updateAdminSite))
  async updateSite(
    @Body() body: unknown,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.updateAdminSite.roles);
    const input = updateSiteRequestSchema.parse(body);
    const result = await this.pool.query(
      `UPDATE floorwalk.sites
       SET name = COALESCE($2, name),
           deactivated_at = CASE
             WHEN $3::boolean IS NULL THEN deactivated_at
             WHEN $3 THEN NULL
             ELSE COALESCE(deactivated_at, now())
           END
       WHERE id = $1 AND org_id = $4
       RETURNING id, code, name, deactivated_at IS NULL AS active,
         created_at AS "createdAt"`,
      [id, input.name ?? null, input.active ?? null, request.user.orgId],
    );
    const site = result.rows[0];
    if (!site)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '门店不存在。',
      });
    return siteResponseSchema.parse({
      ...site,
      createdAt: iso(site.createdAt),
    });
  }
}

function isUniqueViolation(error: unknown) {
  return hasPostgresCode(error, '23505');
}

function hasPostgresCode(error: unknown, code: string) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}
