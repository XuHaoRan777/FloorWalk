import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  apiRoutePath,
  apiRoutes,
  inspectionDetailSchema,
  inspectorTaskDetailSchema,
  todayResponseSchema,
} from '@libs/shared';
import type { Pool } from 'pg';
import { AuthGuard } from '../auth/auth.js';
import { DATABASE_POOL } from '../db/pool.provider.js';
import {
  TASK_SCHEDULER_CLOCK,
  type TaskSchedulerClock,
} from '../services/task-scheduler.js';
import {
  type AuthedRequest,
  iso,
  getDateInTimezone,
  getShanghaiDayBounds,
  assertRole,
  getInspectionAccess,
  loadInspectionDetail,
} from '../queries/inspection-queries.js';

@Controller('api')
export class InspectionController {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(TASK_SCHEDULER_CLOCK)
    private readonly clock: TaskSchedulerClock,
  ) {}

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.today))
  async today(@Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.today.roles);
    if (!request.user.siteId)
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '店员未绑定门店。',
      });
    const templates = await this.pool.query(
      `SELECT id, name, ai_enabled AS "aiEnabled", ai_standard_id AS "aiStandardId",
         created_at AS "createdAt"
       FROM floorwalk.templates WHERE org_id = $1 ORDER BY created_at, id`,
      [request.user.orgId],
    );
    const items = await this.pool.query(
      `SELECT ti.id, ti.template_id AS "templateId", ti.position, ti.title,
         ti.min_photo_count AS "minPhotoCount", ti.acceptance_criteria AS "acceptanceCriteria",
         ti.critical, ti.created_at AS "createdAt"
       FROM floorwalk.template_items ti
       JOIN floorwalk.templates t ON t.id = ti.template_id
       WHERE t.org_id = $1 ORDER BY ti.template_id, ti.position`,
      [request.user.orgId],
    );
    const site = await this.pool.query(
      `SELECT site.id, site.code, site.name,
         site.deactivated_at IS NULL AS active,
         site.created_at AS "createdAt", org.timezone
       FROM floorwalk.sites site
       JOIN floorwalk.organizations org ON org.id = site.org_id
       WHERE site.id = $1 AND site.org_id = $2`,
      [request.user.siteId, request.user.orgId],
    );
    if (!site.rows[0])
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '门店不存在。',
      });
    const taskDate = getDateInTimezone(this.clock.now(), site.rows[0].timezone);
    const tasks = await this.pool.query(
      `SELECT task.id, task.site_id AS "siteId",
         task.template_id AS "templateId", task.task_date::text AS "taskDate",
         task.position, task.starts_at AS "startsAt", task.due_at AS "dueAt",
         task.status, task.created_at AS "createdAt", template.name AS "templateName"
       FROM floorwalk.inspection_tasks task
       JOIN floorwalk.templates template ON template.id = task.template_id
       WHERE task.org_id = $1 AND task.site_id = $2 AND task.task_date = $3::date
       ORDER BY task.starts_at, task.position, task.occurrence, task.id`,
      [request.user.orgId, request.user.siteId, taskDate],
    );
    const rework = await this.pool.query(
      `SELECT id, site_id AS "siteId", template_id AS "templateId",
         inspector_id AS "inspectorId", status, score,
         submitted_at AS "submittedAt", decided_at AS "decidedAt",
         created_at AS "createdAt"
       FROM floorwalk.inspections WHERE site_id = $1 AND status = 'rework'
       ORDER BY created_at`,
      [request.user.siteId],
    );
    const dayBounds = getShanghaiDayBounds();
    const submittedToday = await this.pool.query<{ submittedToday: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM floorwalk.inspections
         WHERE site_id = $1 AND submitted_at >= $2 AND submitted_at < $3
       ) AS "submittedToday"`,
      [request.user.siteId, dayBounds.start, dayBounds.end],
    );
    return todayResponseSchema.parse({
      site: {
        ...site.rows[0],
        createdAt: iso(site.rows[0].createdAt),
      },
      timezone: site.rows[0].timezone,
      tasks: tasks.rows.map((task) => ({
        ...task,
        startsAt: iso(task.startsAt),
        dueAt: iso(task.dueAt),
        createdAt: iso(task.createdAt),
      })),
      templates: templates.rows.map((template) => ({
        ...template,
        createdAt: iso(template.createdAt),
        items: items.rows
          .filter((item) => item.templateId === template.id)
          .map((item) => ({ ...item, createdAt: iso(item.createdAt) })),
      })),
      submittedToday: submittedToday.rows[0]?.submittedToday ?? false,
      reworkInspections: rework.rows.map((item) => ({
        ...item,
        submittedAt: iso(item.submittedAt),
        decidedAt: iso(item.decidedAt),
        createdAt: iso(item.createdAt),
      })),
    });
  }

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.getInspectorTask))
  async getInspectorTask(
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.getInspectorTask.roles);
    if (!request.user.siteId)
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '店长未绑定门店。',
      });

    const taskResult = await this.pool.query<{
      id: string;
      siteId: string;
      templateId: string;
      taskDate: string;
      position: number;
      startsAt: Date;
      dueAt: Date;
      status: 'not_started' | 'in_progress' | 'submitted' | 'overdue';
      createdAt: Date;
      timezone: string;
      templateName: string;
      inspectionId: string | null;
      inspectionStatus: string | null;
    }>(
      `SELECT task.id, task.site_id AS "siteId",
         task.template_id AS "templateId", task.task_date::text AS "taskDate",
         task.position, task.starts_at AS "startsAt", task.due_at AS "dueAt",
         task.status, task.created_at AS "createdAt", template.name AS "templateName",
         organization.timezone,
         inspection.id AS "inspectionId", inspection.status AS "inspectionStatus"
       FROM floorwalk.inspection_tasks task
       JOIN floorwalk.templates template ON template.id = task.template_id
       JOIN floorwalk.organizations organization ON organization.id = task.org_id
       LEFT JOIN floorwalk.inspections inspection ON inspection.task_id = task.id
       WHERE task.id = $1 AND task.org_id = $2 AND task.site_id = $3`,
      [taskId, request.user.orgId, request.user.siteId],
    );
    const task = taskResult.rows[0];
    if (!task)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '巡检任务不存在。',
      });

    const items = task.inspectionId
      ? await this.pool.query(
          `SELECT item.id, item.position, item.title,
             item.min_photo_count AS "minPhotoCount",
             item.acceptance_criteria AS "acceptanceCriteria", item.result,
             manager.display_name AS "uploadedByName",
             item.uploaded_at AS "uploadedAt"
           FROM floorwalk.inspection_items item
           LEFT JOIN floorwalk.users manager ON manager.id = item.uploaded_by_id
           WHERE item.inspection_id = $1 ORDER BY item.position`,
          [task.inspectionId],
        )
      : await this.pool.query(
          `SELECT id, position, title,
             min_photo_count AS "minPhotoCount",
             acceptance_criteria AS "acceptanceCriteria",
             'pending'::text AS result, NULL::text AS "uploadedByName",
             NULL::timestamptz AS "uploadedAt"
           FROM floorwalk.template_items WHERE template_id = $1
           ORDER BY position`,
          [task.templateId],
        );

    return inspectorTaskDetailSchema.parse({
      ...task,
      startsAt: iso(task.startsAt),
      dueAt: iso(task.dueAt),
      createdAt: iso(task.createdAt),
      items: items.rows.map((item) => ({
        ...item,
        uploadedAt: iso(item.uploadedAt),
      })),
    });
  }

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.getInspection))
  async getInspection(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    const inspection = await getInspectionAccess(this.pool, id, request.user);
    const detail = await loadInspectionDetail(this.pool, inspection);
    return inspectionDetailSchema.parse(detail);
  }
}
