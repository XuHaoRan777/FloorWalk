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
  todayResponseSchema,
} from '@libs/shared';
import type { Pool } from 'pg';
import { AuthGuard } from './auth.js';
import { DATABASE_POOL } from './db/pool.provider.js';
import {
  type AuthedRequest,
  iso,
  getShanghaiDayBounds,
  assertRole,
  getInspectionAccess,
  loadInspectionDetail,
} from './inspection-queries.js';

@Controller('api')
export class InspectionController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

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
      `SELECT id, code, name, deactivated_at IS NULL AS active,
         created_at AS "createdAt"
       FROM floorwalk.sites WHERE id = $1 AND org_id = $2`,
      [request.user.siteId, request.user.orgId],
    );
    if (!site.rows[0])
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '门店不存在。',
      });
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
