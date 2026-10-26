import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import {
  apiRoutePath,
  apiRoutes,
  canSupervisorApprove,
  reviewQueueResponseSchema,
  reviewRequestSchema,
  reviewResponseSchema,
} from '@libs/shared';
import { createPool } from './db/client.js';
import { AuthGuard } from './auth.js';
import {
  type AuthedRequest,
  assertRole,
  assertInspectionAccess,
  loadInspectionDetail,
} from './inspection-queries.js';

@Controller('api')
export class ReviewController {
  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.reviewQueue))
  async queue(@Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.reviewQueue.roles);
    const pool = createPool();
    try {
      const result = await pool.query(
        `SELECT id, site_id AS "siteId", template_id AS "templateId", inspector_id AS "inspectorId",
          status, score, submitted_at AS "submittedAt", decided_at AS "decidedAt", created_at AS "createdAt"
         FROM floorwalk.inspections WHERE status IN ('submitted', 'in_review') ORDER BY created_at`,
      );
      const details = await Promise.all(
        result.rows.map((row) => loadInspectionDetail(pool, row)),
      );
      return reviewQueueResponseSchema.parse(details);
    } finally {
      await pool.end();
    }
  }

  @UseGuards(AuthGuard)
  @Post(apiRoutePath(apiRoutes.reviewInspection))
  async review(
    @Body() body: unknown,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.reviewInspection.roles);
    const input = reviewRequestSchema.parse(body);
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
      const items = await client.query(
        `SELECT id, inspection_id AS "inspectionId", position, title,
           photo_required AS "photoRequired", critical, result, note,
           created_at AS "createdAt"
         FROM floorwalk.inspection_items WHERE inspection_id = $1 ORDER BY position`,
        [id],
      );
      const expectedStatus =
        input.action === 'start' ? 'submitted' : 'in_review';
      if (inspection.status !== expectedStatus)
        throw new ConflictException({
          code: 'INVALID_STATE',
          message: '当前状态不允许执行该审核操作。',
        });
      if (input.action === 'approve' && !canSupervisorApprove(items.rows))
        throw new UnprocessableEntityException({
          code: 'CRITICAL_FAILED',
          message: '存在不合格的严重检查项，不能通过。',
        });
      if (input.action === 'rework') {
        const requestedIds = input.reworkItemIds ?? [];
        const itemIds = new Set(items.rows.map((item) => item.id));
        if (requestedIds.some((itemId) => !itemIds.has(itemId)))
          throw new BadRequestException({
            code: 'VALIDATION_FAILED',
            message: '打回检查项必须属于当前巡检单。',
          });
      }
      const nextStatus =
        input.action === 'start'
          ? 'in_review'
          : input.action === 'approve'
            ? 'passed'
            : input.action === 'rework'
              ? 'rework'
              : 'failed';
      const decidedAt =
        input.action === 'approve' || input.action === 'fail'
          ? new Date()
          : null;
      const updated = await client.query(
        `UPDATE floorwalk.inspections
         SET status = $2, decided_at = COALESCE($3, decided_at)
         WHERE id = $1
         RETURNING id, site_id AS "siteId", template_id AS "templateId", inspector_id AS "inspectorId", status, score, submitted_at AS "submittedAt", decided_at AS "decidedAt", created_at AS "createdAt"`,
        [id, nextStatus, decidedAt],
      );
      await client.query(
        `INSERT INTO floorwalk.reviews
          (inspection_id, reviewer_id, action, comment, rework_item_ids)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          id,
          request.user.id,
          input.action,
          input.comment ?? null,
          input.action === 'rework' ? input.reworkItemIds : null,
        ],
      );
      await client.query('COMMIT');
      committed = true;
      const detail = await loadInspectionDetail(pool, updated.rows[0]);
      return reviewResponseSchema.parse(detail);
    } catch (error) {
      if (!committed) await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }
}
