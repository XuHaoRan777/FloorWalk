import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  apiRoutePath,
  apiRoutes,
  adminTodayResponseSchema,
  dashboardPeriodResponseSchema,
  dashboardSitesResponseSchema,
  selfCheckStatsResponseSchema,
} from '@libs/shared';
import { DATABASE_POOL } from '../db/pool.provider.js';
import type { Pool } from 'pg';
import { AuthGuard } from '../auth/auth.js';
import {
  type AuthedRequest,
  iso,
  assertRole,
  getDateInTimezone,
} from '../queries/inspection-queries.js';
import {
  loadDashboardTasks,
  loadPeriodDashboard,
} from '../queries/dashboard-query.js';

@Controller('api')
export class DashboardController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.adminToday))
  async today(@Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.adminToday.roles);
    const organization = await this.pool.query<{ timezone: string }>(
      'SELECT timezone FROM floorwalk.organizations WHERE id = $1',
      [request.user.orgId],
    );
    const timezone = organization.rows[0].timezone;
    const now = new Date();
    const date = getDateInTimezone(now, timezone);
    const tasks = await loadDashboardTasks(
      this.pool,
      request.user.orgId,
      date,
      date,
      now,
    );
    return adminTodayResponseSchema.parse({
      date,
      timezone,
      tasks,
      summary: {
        expected: tasks.length,
        completed: tasks.filter((task) => task.status === 'submitted').length,
        overdue: tasks.filter((task) => task.status === 'overdue').length,
      },
    });
  }

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.dashboardPeriod))
  async period(@Query() query: unknown, @Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.dashboardPeriod.roles);
    const input = apiRoutes.dashboardPeriod.requestSchema.parse(query);
    const organization = await this.pool.query<{ timezone: string }>(
      'SELECT timezone FROM floorwalk.organizations WHERE id = $1',
      [request.user.orgId],
    );
    const timezone = organization.rows[0].timezone;
    const now = new Date();
    return dashboardPeriodResponseSchema.parse(
      await loadPeriodDashboard(
        this.pool,
        request.user.orgId,
        input.period,
        getDateInTimezone(now, timezone),
        timezone,
        now,
      ),
    );
  }

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.selfCheckStats))
  async selfCheckStats(@Query() query: unknown, @Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.selfCheckStats.roles);
    const input = apiRoutes.selfCheckStats.requestSchema.parse(query);
    const target = await this.pool.query(
      input.scope === 'site'
        ? 'SELECT id FROM floorwalk.sites WHERE id = $1 AND org_id = $2'
        : `SELECT id FROM floorwalk.users
           WHERE id = $1 AND org_id = $2 AND role = 'store_manager'`,
      [input.id, request.user.orgId],
    );
    if (!target.rowCount)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '统计对象不存在。',
      });
    const counts = await this.pool.query<{
      sampleCount: number;
      matchingCount: number;
    }>(
      `SELECT count(*)::int AS "sampleCount",
         count(*) FILTER (WHERE item.first_self_assessment = item.first_result)::int
           AS "matchingCount"
       FROM floorwalk.inspection_items item
       JOIN floorwalk.inspections inspection ON inspection.id = item.inspection_id
       JOIN floorwalk.inspection_tasks task ON task.id = inspection.task_id
       WHERE task.org_id = $1
         AND (($3 = 'site' AND task.site_id = $2)
           OR ($3 = 'manager' AND item.first_uploaded_by_id = $2))
         AND task.task_date BETWEEN $4::date AND $5::date
         AND item.first_self_assessment IS NOT NULL AND item.first_result IS NOT NULL`,
      [request.user.orgId, input.id, input.scope, input.from, input.to],
    );
    const { sampleCount, matchingCount } = counts.rows[0];
    return selfCheckStatsResponseSchema.parse({
      sampleCount,
      matchingCount,
      accuracy: sampleCount === 0 ? null : matchingCount / sampleCount,
    });
  }

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.dashboardSites))
  async dashboard(@Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.dashboardSites.roles);
    const rows = await this.pool.query(
      `SELECT s.id, s.code, s.name, s.deactivated_at IS NULL AS active,
          s.created_at AS "createdAt", i.score AS "latestScore", i.status AS "latestStatus"
         FROM floorwalk.sites s
         LEFT JOIN LATERAL (
           SELECT score, status FROM floorwalk.inspections
           WHERE site_id = s.id AND status IN ('passed', 'failed')
           ORDER BY decided_at DESC NULLS LAST LIMIT 1
         ) i ON true
         WHERE s.org_id = $1
         ORDER BY s.code`,
      [request.user.orgId],
    );
    return dashboardSitesResponseSchema.parse(
      rows.rows.map((row) => ({
        site: {
          id: row.id,
          code: row.code,
          name: row.name,
          active: row.active,
          createdAt: iso(row.createdAt),
        },
        latestScore: row.latestScore,
        latestStatus: row.latestStatus,
      })),
    );
  }
}
