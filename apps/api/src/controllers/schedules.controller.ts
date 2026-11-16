import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  apiRoutePath,
  apiRoutes,
  addScheduleSkipsRequestSchema,
  adminSchedulesResponseSchema,
  adminSiteSchedulesResponseSchema,
  assignScheduleRequestSchema,
  scheduleDefinitionSchema,
  type AdminSiteSchedule,
  type AdminSchedule,
} from '@libs/shared';
import type { Pool, PoolClient } from 'pg';
import { AuthGuard } from '../auth/auth.js';
import { DATABASE_POOL } from '../db/pool.provider.js';
import {
  assertRole,
  type AuthedRequest,
} from '../queries/inspection-queries.js';
import {
  assertScheduleTemplates,
  writeScheduleDays,
} from '../services/schedule-persistence.js';
import { TaskSchedulerService } from '../services/task-scheduler.js';

type ScheduleRow = {
  id: string;
  name: string;
  weekday: number;
  enabled: boolean;
  templateId: string | null;
  startsAt: string | null;
  endsAt: string | null;
};

@Controller('api')
export class SchedulesController {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(TaskSchedulerService)
    private readonly taskScheduler: TaskSchedulerService,
  ) {}

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.listAdminSchedules))
  async listSchedules(@Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.listAdminSchedules.roles);
    return this.readSchedules(this.pool, request.user.orgId);
  }

  @UseGuards(AuthGuard)
  @Post(apiRoutePath(apiRoutes.createAdminSchedule))
  async createSchedule(@Body() body: unknown, @Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.createAdminSchedule.roles);
    const input = scheduleDefinitionSchema.parse(body);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await assertScheduleTemplates(client, request.user.orgId, input);
      const created = await client.query<{ id: string }>(
        `INSERT INTO floorwalk.schedules (org_id, name) VALUES ($1, $2)
         RETURNING id`,
        [request.user.orgId, input.name],
      );
      const id = created.rows[0].id;
      await writeScheduleDays(client, request.user.orgId, id, input);
      const [result] = await this.readSchedules(client, request.user.orgId, id);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if (hasPostgresCode(error, '23505')) throw scheduleNameConflict();
      throw error;
    } finally {
      client.release();
    }
  }

  @UseGuards(AuthGuard)
  @Put(apiRoutePath(apiRoutes.updateAdminSchedule))
  async updateSchedule(
    @Body() body: unknown,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.updateAdminSchedule.roles);
    const input = scheduleDefinitionSchema.parse(body);
    const client = await this.pool.connect();
    let assignedSiteIds: string[];
    let result: AdminSchedule;
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        'SELECT id FROM floorwalk.schedules WHERE id = $1 AND org_id = $2 FOR UPDATE',
        [id, request.user.orgId],
      );
      if (!existing.rowCount) throw scheduleNotFound();
      const assignments = await client.query<{ siteId: string }>(
        `SELECT site_id AS "siteId" FROM floorwalk.site_schedules
         WHERE org_id = $1 AND schedule_id = $2 ORDER BY site_id`,
        [request.user.orgId, id],
      );
      assignedSiteIds = assignments.rows.map((row) => row.siteId);
      await assertScheduleTemplates(client, request.user.orgId, input);
      await client.query(
        'UPDATE floorwalk.schedules SET name = $3 WHERE id = $1 AND org_id = $2',
        [id, request.user.orgId, input.name],
      );
      await client.query(
        'DELETE FROM floorwalk.schedule_days WHERE org_id = $1 AND schedule_id = $2',
        [request.user.orgId, id],
      );
      await writeScheduleDays(client, request.user.orgId, id, input);
      const schedules = await this.readSchedules(
        client,
        request.user.orgId,
        id,
      );
      if (!schedules[0]) throw scheduleNotFound();
      result = schedules[0];
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (hasPostgresCode(error, '23505')) throw scheduleNameConflict();
      throw error;
    } finally {
      client.release();
    }
    await this.taskScheduler.syncSitesToday(assignedSiteIds);
    return result;
  }

  @UseGuards(AuthGuard)
  @Delete(apiRoutePath(apiRoutes.deleteAdminSchedule))
  @HttpCode(204)
  async deleteSchedule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.deleteAdminSchedule.roles);
    try {
      const result = await this.pool.query(
        'DELETE FROM floorwalk.schedules WHERE id = $1 AND org_id = $2 RETURNING id',
        [id, request.user.orgId],
      );
      if (!result.rowCount) throw scheduleNotFound();
    } catch (error) {
      if (hasPostgresCode(error, '23001') || hasPostgresCode(error, '23503'))
        throw new ConflictException({
          code: 'INVALID_STATE',
          message: '该日程方案仍被门店选用，不能删除。',
        });
      throw error;
    }
  }

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.listAdminSiteSchedules))
  async listSiteSchedules(@Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.listAdminSiteSchedules.roles);
    return this.readSiteSchedules(this.pool, request.user.orgId);
  }

  @UseGuards(AuthGuard)
  @Put(apiRoutePath(apiRoutes.assignAdminSiteSchedule))
  async assignSiteSchedule(
    @Body() body: unknown,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.assignAdminSiteSchedule.roles);
    const input = assignScheduleRequestSchema.parse(body);
    const client = await this.pool.connect();
    let siteIds: string[];
    let result: AdminSiteSchedule[];
    try {
      await client.query('BEGIN');
      siteIds = await this.assertSites(
        client,
        request.user.orgId,
        input.siteIds,
      );
      if (input.scheduleId) {
        const schedule = await client.query(
          'SELECT id FROM floorwalk.schedules WHERE org_id = $1 AND id = $2 FOR KEY SHARE',
          [request.user.orgId, input.scheduleId],
        );
        if (!schedule.rowCount) throw scheduleNotFound();
        await client.query(
          `INSERT INTO floorwalk.site_schedules (org_id, site_id, schedule_id)
           SELECT $1, site_id, $3 FROM unnest($2::uuid[]) AS site_id
           ON CONFLICT (org_id, site_id) DO UPDATE SET schedule_id = EXCLUDED.schedule_id`,
          [request.user.orgId, siteIds, input.scheduleId],
        );
      } else {
        await client.query(
          'DELETE FROM floorwalk.site_schedules WHERE org_id = $1 AND site_id = ANY($2::uuid[])',
          [request.user.orgId, siteIds],
        );
      }
      result = await this.readSiteSchedules(client, request.user.orgId);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await this.taskScheduler.syncSitesToday(siteIds);
    return result;
  }

  @UseGuards(AuthGuard)
  @Post(apiRoutePath(apiRoutes.addAdminSiteScheduleSkips))
  async addSiteScheduleSkips(
    @Body() body: unknown,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.addAdminSiteScheduleSkips.roles);
    const input = addScheduleSkipsRequestSchema.parse(body);
    const client = await this.pool.connect();
    let siteIds: string[];
    let result: AdminSiteSchedule[];
    try {
      await client.query('BEGIN');
      siteIds = await this.assertSites(
        client,
        request.user.orgId,
        input.siteIds,
      );
      await client.query(
        `INSERT INTO floorwalk.site_schedule_skips (org_id, site_id, starts_on, ends_on, note)
         SELECT $1, site_id, $3::date, $4::date, $5 FROM unnest($2::uuid[]) AS site_id`,
        [
          request.user.orgId,
          siteIds,
          input.startsOn,
          input.endsOn,
          input.note ?? null,
        ],
      );
      result = await this.readSiteSchedules(client, request.user.orgId);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await this.taskScheduler.syncSitesToday(siteIds);
    return result;
  }

  @UseGuards(AuthGuard)
  @Delete(apiRoutePath(apiRoutes.deleteAdminSiteScheduleSkip))
  @HttpCode(204)
  async deleteSiteScheduleSkip(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.deleteAdminSiteScheduleSkip.roles);
    const client = await this.pool.connect();
    let siteId: string;
    try {
      await client.query('BEGIN');
      const result = await client.query<{ siteId: string }>(
        `DELETE FROM floorwalk.site_schedule_skips
         WHERE id = $1 AND org_id = $2 RETURNING site_id AS "siteId"`,
        [id, request.user.orgId],
      );
      if (!result.rows[0])
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '跳过日期区间不存在。',
        });
      siteId = result.rows[0].siteId;
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await this.taskScheduler.syncSitesToday([siteId]);
  }

  private async assertSites(client: PoolClient, orgId: string, ids: string[]) {
    const siteIds = [...new Set(ids)];
    const sites = await client.query(
      'SELECT id FROM floorwalk.sites WHERE org_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE',
      [orgId, siteIds],
    );
    if (sites.rowCount !== siteIds.length)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '门店不存在。',
      });
    return siteIds;
  }

  private async readSiteSchedules(
    database: Pick<Pool, 'query'>,
    orgId: string,
  ) {
    const result = await database.query(
      `SELECT site.id AS "siteId", site.code AS "siteCode", site.name AS "siteName",
         site.deactivated_at IS NULL AS active, s.id AS "scheduleId", s.name AS "scheduleName",
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
           'id', skip.id, 'startsOn', skip.starts_on, 'endsOn', skip.ends_on, 'note', skip.note
         ) ORDER BY skip.starts_on, skip.ends_on, skip.id)
         FROM floorwalk.site_schedule_skips skip WHERE skip.org_id = site.org_id AND skip.site_id = site.id),
         '[]'::jsonb) AS "skippedRanges"
       FROM floorwalk.sites site
       LEFT JOIN floorwalk.site_schedules assignment ON assignment.org_id = site.org_id AND assignment.site_id = site.id
       LEFT JOIN floorwalk.schedules s ON s.org_id = assignment.org_id AND s.id = assignment.schedule_id
       WHERE site.org_id = $1 ORDER BY site.code, site.id`,
      [orgId],
    );
    return adminSiteSchedulesResponseSchema.parse(result.rows);
  }

  private async readSchedules(
    database: Pick<Pool, 'query'>,
    orgId: string,
    id: string | null = null,
  ) {
    const rows = await database.query<ScheduleRow>(
      `SELECT s.id, s.name, d.weekday, d.enabled, t.template_id AS "templateId",
         left(t.starts_at::text, 5) AS "startsAt", left(t.ends_at::text, 5) AS "endsAt"
       FROM floorwalk.schedules s
       JOIN floorwalk.schedule_days d ON d.org_id = s.org_id AND d.schedule_id = s.id
       LEFT JOIN floorwalk.schedule_tasks t
         ON t.org_id = d.org_id AND t.schedule_id = d.schedule_id AND t.weekday = d.weekday
       WHERE s.org_id = $1 AND ($2::uuid IS NULL OR s.id = $2)
       ORDER BY s.name, s.id, d.weekday, t.position`,
      [orgId, id],
    );
    const schedules = new Map<string, AdminSchedule>();
    for (const row of rows.rows) {
      let schedule = schedules.get(row.id);
      if (!schedule) {
        schedule = { id: row.id, name: row.name, days: [] };
        schedules.set(row.id, schedule);
      }
      let day = schedule.days.find((entry) => entry.weekday === row.weekday);
      if (!day) {
        day = { weekday: row.weekday, enabled: row.enabled, tasks: [] };
        schedule.days.push(day);
      }
      if (row.templateId && row.startsAt && row.endsAt)
        day.tasks.push({
          templateId: row.templateId,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
        });
    }
    return adminSchedulesResponseSchema.parse([...schedules.values()]);
  }
}

function hasPostgresCode(error: unknown, code: string) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

function scheduleNameConflict() {
  return new ConflictException({
    code: 'INVALID_STATE',
    message: '日程方案名称已存在。',
  });
}

function scheduleNotFound() {
  return new NotFoundException({
    code: 'NOT_FOUND',
    message: '日程方案不存在。',
  });
}
