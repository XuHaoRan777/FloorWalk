import {
  Controller,
  Get,
  Inject,
  NotImplementedException,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  apiRoutePath,
  apiRoutes,
  adminUsersResponseSchema,
} from '@libs/shared';
import type { Pool } from 'pg';
import { AuthGuard } from './auth.js';
import { DATABASE_POOL } from './db/pool.provider.js';
import { assertRole, iso, type AuthedRequest } from './inspection-queries.js';

@Controller('api')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get(apiRoutePath(apiRoutes.listAdminUsers))
  async listUsers(@Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.listAdminUsers.roles);
    const result = await this.pool.query(
      `SELECT u.id, u.email, u.display_name AS "displayName", u.role,
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
       WHERE u.org_id = $1 AND ($2 = 'admin' OR (u.role = 'inspector' AND EXISTS (
         SELECT 1 FROM floorwalk.site_supervisors ss
         WHERE ss.site_id = s.id AND ss.user_id = $3
       ))) ORDER BY u.display_name, u.id`,
      [request.user.orgId, request.user.role, request.user.id],
    );
    return adminUsersResponseSchema.parse(
      result.rows.map((row) => ({ ...row, createdAt: iso(row.createdAt) })),
    );
  }

  @Post(apiRoutePath(apiRoutes.createAdminUser))
  createUser(@Req() request: AuthedRequest): never {
    assertRole(request.user, ...apiRoutes.createAdminUser.roles);
    throw new NotImplementedException();
  }

  @Patch(apiRoutePath(apiRoutes.updateAdminUser))
  updateUser(@Req() request: AuthedRequest): never {
    assertRole(request.user, ...apiRoutes.updateAdminUser.roles);
    throw new NotImplementedException();
  }

  @Post(apiRoutePath(apiRoutes.resetAdminUserPassword))
  resetPassword(@Req() request: AuthedRequest): never {
    assertRole(request.user, ...apiRoutes.resetAdminUserPassword.roles);
    throw new NotImplementedException();
  }

  @Post(apiRoutePath(apiRoutes.changePassword))
  changePassword(@Req() request: AuthedRequest): never {
    assertRole(request.user, ...apiRoutes.changePassword.roles);
    throw new NotImplementedException();
  }
}
