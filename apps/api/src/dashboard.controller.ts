import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import {
  apiRoutePath,
  apiRoutes,
  dashboardSitesResponseSchema,
} from '@libs/shared';
import { DATABASE_POOL } from './db/pool.provider.js';
import type { Pool } from 'pg';
import { AuthGuard } from './auth.js';
import { type AuthedRequest, iso, assertRole } from './inspection-queries.js';

@Controller('api')
export class DashboardController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.dashboardSites))
  async dashboard(@Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.dashboardSites.roles);
    const rows = await this.pool.query(
      `SELECT s.id, s.code, s.name, s.created_at AS "createdAt", i.score AS "latestScore", i.status AS "latestStatus"
         FROM floorwalk.sites s
         LEFT JOIN LATERAL (
           SELECT score, status FROM floorwalk.inspections
           WHERE site_id = s.id AND status IN ('passed', 'failed')
           ORDER BY decided_at DESC NULLS LAST LIMIT 1
         ) i ON true ORDER BY s.code`,
    );
    return dashboardSitesResponseSchema.parse(
      rows.rows.map((row) => ({
        site: {
          id: row.id,
          code: row.code,
          name: row.name,
          createdAt: iso(row.createdAt),
        },
        latestScore: row.latestScore,
        latestStatus: row.latestStatus,
      })),
    );
  }
}
