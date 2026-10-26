import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import {
  apiRoutePath,
  apiRoutes,
  calculateInspectionScore,
  createInspectionRequestSchema,
  inspectionSchema,
  submitInspectionResponseSchema,
  todayResponseSchema,
  updateInspectionItemRequestSchema,
  updateInspectionItemResponseSchema,
  validateInspectionSubmission,
} from '@libs/shared';
import { createPool } from './db/client.js';
import { AuthGuard } from './auth.js';
import {
  type AuthedRequest,
  iso,
  getShanghaiDayBounds,
  assertRole,
  assertInspectionAccess,
  getInspectionAccess,
  loadInspectionDetail,
} from './inspection-queries.js';

@Controller('api')
export class InspectionController {
  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.today))
  async today(@Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.today.roles);
    if (!request.user.siteId)
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '店员未绑定门店。',
      });
    const pool = createPool();
    try {
      const template = await pool.query(
        'SELECT id, name, created_at AS "createdAt" FROM floorwalk.templates ORDER BY created_at LIMIT 1',
      );
      if (!template.rows[0])
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '检查模板不存在。',
        });
      const items = await pool.query(
        'SELECT id, template_id AS "templateId", position, title, photo_required AS "photoRequired", critical, created_at AS "createdAt" FROM floorwalk.template_items WHERE template_id = $1 ORDER BY position',
        [template.rows[0].id],
      );
      const site = await pool.query(
        'SELECT id, code, name, created_at AS "createdAt" FROM floorwalk.sites WHERE id = $1',
        [request.user.siteId],
      );
      if (!site.rows[0])
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '门店不存在。',
        });
      const rework = await pool.query(
        'SELECT id, site_id AS "siteId", template_id AS "templateId", inspector_id AS "inspectorId", status, score, submitted_at AS "submittedAt", decided_at AS "decidedAt", created_at AS "createdAt" FROM floorwalk.inspections WHERE site_id = $1 AND status = \'rework\' ORDER BY created_at',
        [request.user.siteId],
      );
      const dayBounds = getShanghaiDayBounds();
      const submittedToday = await pool.query<{ submittedToday: boolean }>(
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
        template: {
          ...template.rows[0],
          createdAt: iso(template.rows[0].createdAt),
          items: items.rows.map((item) => ({
            ...item,
            createdAt: iso(item.createdAt),
          })),
        },
        submittedToday: submittedToday.rows[0]?.submittedToday ?? false,
        reworkInspections: rework.rows.map((item) => ({
          ...item,
          submittedAt: iso(item.submittedAt),
          decidedAt: iso(item.decidedAt),
          createdAt: iso(item.createdAt),
        })),
      });
    } finally {
      await pool.end();
    }
  }

  @UseGuards(AuthGuard)
  @Post(apiRoutePath(apiRoutes.createInspection))
  async createInspection(@Body() body: unknown, @Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.createInspection.roles);
    if (!request.user.siteId)
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '店员未绑定门店。',
      });
    const input = createInspectionRequestSchema.parse(body);
    const pool = createPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inspection = await client.query(
        `INSERT INTO floorwalk.inspections (site_id, template_id, inspector_id, status)
         VALUES ($1, $2, $3, 'draft')
         RETURNING id, site_id AS "siteId", template_id AS "templateId", inspector_id AS "inspectorId", status, score, submitted_at AS "submittedAt", decided_at AS "decidedAt", created_at AS "createdAt"`,
        [request.user.siteId, input.templateId, request.user.id],
      );
      const items = await client.query(
        'SELECT position, title, photo_required, critical FROM floorwalk.template_items WHERE template_id = $1 ORDER BY position',
        [input.templateId],
      );
      for (const item of items.rows) {
        await client.query(
          `INSERT INTO floorwalk.inspection_items (inspection_id, position, title, photo_required, critical)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            inspection.rows[0].id,
            item.position,
            item.title,
            item.photo_required,
            item.critical,
          ],
        );
      }
      await client.query('COMMIT');
      return inspectionSchema.parse({
        ...inspection.rows[0],
        submittedAt: iso(inspection.rows[0].submittedAt),
        decidedAt: iso(inspection.rows[0].decidedAt),
        createdAt: iso(inspection.rows[0].createdAt),
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.getInspection))
  async getInspection(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    const pool = createPool();
    try {
      const inspection = await getInspectionAccess(pool, id, request.user);
      return await loadInspectionDetail(pool, inspection);
    } finally {
      await pool.end();
    }
  }

  @UseGuards(AuthGuard)
  @Patch(apiRoutePath(apiRoutes.updateInspectionItem))
  async updateItem(
    @Body() body: unknown,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.updateInspectionItem.roles);
    const input = updateInspectionItemRequestSchema.parse(body);
    const pool = createPool();
    const client = await pool.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      const inspectionResult = await client.query(
        'SELECT id, site_id AS "siteId", inspector_id AS "inspectorId", status FROM floorwalk.inspections WHERE id = $1 FOR UPDATE',
        [id],
      );
      const inspection = inspectionResult.rows[0];
      if (!inspection)
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '巡检单不存在。',
        });
      assertInspectionAccess(inspection, request.user);
      if (inspection.status !== 'draft' && inspection.status !== 'rework')
        throw new ConflictException({
          code: 'INVALID_STATE',
          message: '只有草稿或打回状态的巡检单可以修改。',
        });
      const item = await client.query(
        `UPDATE floorwalk.inspection_items
         SET result = $1, note = $2
         WHERE id = $3 AND inspection_id = $4
         RETURNING id, inspection_id AS "inspectionId", position, title,
           photo_required AS "photoRequired", critical, result, note,
           created_at AS "createdAt"`,
        [input.result, input.note ?? null, itemId, inspection.id],
      );
      if (!item.rows[0])
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '检查项不存在。',
        });
      const evidence = await client.query(
        `SELECT id, inspection_item_id AS "inspectionItemId", storage_key AS "storageKey",
          mime, size, created_at AS "createdAt"
         FROM floorwalk.evidence WHERE inspection_item_id = $1 ORDER BY created_at`,
        [itemId],
      );
      const response = updateInspectionItemResponseSchema.parse({
        ...item.rows[0],
        createdAt: iso(item.rows[0].createdAt),
        evidence: evidence.rows.map((row) => ({
          ...row,
          createdAt: iso(row.createdAt),
        })),
      });
      await client.query('COMMIT');
      committed = true;
      return response;
    } catch (error) {
      if (!committed) await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }

  @UseGuards(AuthGuard)
  @Post(apiRoutePath(apiRoutes.submitInspection))
  async submit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.submitInspection.roles);
    const pool = createPool();
    const client = await pool.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      const inspectionResult = await client.query(
        'SELECT id, site_id AS "siteId", template_id AS "templateId", inspector_id AS "inspectorId", status, score, submitted_at AS "submittedAt", decided_at AS "decidedAt", created_at AS "createdAt" FROM floorwalk.inspections WHERE id = $1 FOR UPDATE',
        [id],
      );
      const inspection = inspectionResult.rows[0];
      if (!inspection)
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '巡检单不存在。',
        });
      assertInspectionAccess(inspection, request.user);
      if (inspection.status !== 'draft' && inspection.status !== 'rework')
        throw new ConflictException({
          code: 'INVALID_STATE',
          message: '只有草稿或打回状态的巡检单可以提交。',
        });
      const items = await client.query(
        `SELECT id, inspection_id AS "inspectionId", position, title,
           photo_required AS "photoRequired", critical, result, note,
           created_at AS "createdAt"
         FROM floorwalk.inspection_items WHERE inspection_id = $1 ORDER BY position`,
        [id],
      );
      const evidenceCounts = await client.query<{ id: string; count: string }>(
        `SELECT ii.id, COUNT(e.id)::text AS count
         FROM floorwalk.inspection_items ii
         LEFT JOIN floorwalk.evidence e ON e.inspection_item_id = ii.id
         WHERE ii.inspection_id = $1 GROUP BY ii.id`,
        [id],
      );
      const evidenceCountByItemId = Object.fromEntries(
        evidenceCounts.rows.map((row) => [row.id, Number(row.count)]),
      );
      try {
        validateInspectionSubmission({
          items: items.rows,
          evidenceCountByItemId,
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'INCOMPLETE')
          throw new UnprocessableEntityException({
            code: 'INCOMPLETE',
            message: '所有检查项必须完成，必拍项必须有照片。',
          });
        throw error;
      }
      const score = calculateInspectionScore(
        items.rows.map((item) => item.result),
      );
      const submittedAt = new Date();
      const persisted = await client.query(
        `UPDATE floorwalk.inspections
         SET status = 'submitted', score = $2, submitted_at = $3
         WHERE id = $1
         RETURNING id, site_id AS "siteId", template_id AS "templateId", inspector_id AS "inspectorId", status, score, submitted_at AS "submittedAt", decided_at AS "decidedAt", created_at AS "createdAt"`,
        [id, score, submittedAt],
      );
      await client.query('COMMIT');
      committed = true;
      return submitInspectionResponseSchema.parse({
        ...persisted.rows[0],
        submittedAt: iso(persisted.rows[0].submittedAt),
        decidedAt: iso(persisted.rows[0].decidedAt),
        createdAt: iso(persisted.rows[0].createdAt),
      });
    } catch (error) {
      if (!committed) await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }
}
