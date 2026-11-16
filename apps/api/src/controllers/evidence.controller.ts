import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFiles,
  Req,
  UnprocessableEntityException,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  apiRoutePath,
  apiRoutes,
  evidenceMimeTypes,
  evidenceSchema,
  maxEvidenceSizeBytes,
  signedEvidenceResponseSchema,
  taskItemUploadFilesFieldName,
  taskItemUploadMetadataSchema,
  taskItemUploadResponseSchema,
} from '@libs/shared';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { AuthGuard } from '../auth/auth.js';
import { DATABASE_POOL } from '../db/pool.provider.js';
import {
  assertRole,
  type AuthedRequest,
  type UploadedImage,
  getInspectionAccess,
  iso,
} from '../queries/inspection-queries.js';
import { getStorageDriver } from '../storage/index.js';
import { AiReviewQueueService } from '../services/ai-review-queue.js';
import {
  TASK_SCHEDULER_CLOCK,
  type TaskSchedulerClock,
} from '../services/task-scheduler.js';

type UploadTaskRow = {
  id: string;
  orgId: string;
  siteId: string;
  templateId: string;
  startsAt: Date;
  dueAt: Date;
};

@Controller('api')
export class EvidenceController {
  private readonly logger = new Logger(EvidenceController.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(TASK_SCHEDULER_CLOCK) private readonly clock: TaskSchedulerClock,
    @Inject(AiReviewQueueService)
    private readonly aiReviewQueue: AiReviewQueueService,
  ) {}

  @UseGuards(AuthGuard)
  @Post(apiRoutePath(apiRoutes.uploadTaskItem))
  @UseInterceptors(
    FilesInterceptor(taskItemUploadFilesFieldName, undefined, {
      limits: { fileSize: maxEvidenceSizeBytes },
    }),
  )
  async uploadTaskItem(
    @Body() body: unknown,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Param('position') position: string,
    @UploadedFiles() files: UploadedImage[] | undefined,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.uploadTaskItem.roles);
    const itemPosition = Number(position);
    if (!Number.isSafeInteger(itemPosition) || itemPosition < 1)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '检查项位置无效。',
      });
    const input = taskItemUploadMetadataSchema.parse(body);
    const uploads = files ?? [];
    for (const file of uploads) {
      if (
        !evidenceMimeTypes.some((mime) => mime === file.mimetype) ||
        file.size > maxEvidenceSizeBytes
      )
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: '照片格式或大小不符合要求。',
        });
    }

    const now = this.clock.now();
    const pool = this.pool;
    const storage = await getStorageDriver();
    const client = await pool.connect();
    const writtenKeys: string[] = [];
    let oldKeys: string[];
    let committed = false;
    try {
      await client.query('BEGIN');
      const taskHintResult = await client.query<UploadTaskRow>(
        `SELECT id, org_id AS "orgId", site_id AS "siteId",
           template_id AS "templateId", starts_at AS "startsAt",
           due_at AS "dueAt"
         FROM floorwalk.inspection_tasks
         WHERE id = $1 AND org_id = $2`,
        [taskId, request.user.orgId],
      );
      const taskHint = taskHintResult.rows[0];
      if (!taskHint)
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '任务不存在。',
        });
      if (taskHint.siteId !== request.user.siteId) {
        const userSite = await client.query(
          'SELECT id FROM floorwalk.sites WHERE id = $1 AND org_id = $2',
          [request.user.siteId, taskHint.orgId],
        );
        if (!userSite.rowCount)
          throw new NotFoundException({
            code: 'NOT_FOUND',
            message: '任务不存在。',
          });
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: '不能上传其他门店的巡检任务。',
        });
      }
      const siteResult = await client.query<{ active: boolean }>(
        `SELECT deactivated_at IS NULL AS active
         FROM floorwalk.sites WHERE id = $1 AND org_id = $2 FOR SHARE`,
        [taskHint.siteId, taskHint.orgId],
      );
      if (!siteResult.rows[0])
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '任务不存在。',
        });
      const taskResult = await client.query<UploadTaskRow>(
        `SELECT id, org_id AS "orgId", site_id AS "siteId",
           template_id AS "templateId", starts_at AS "startsAt",
           due_at AS "dueAt"
         FROM floorwalk.inspection_tasks
         WHERE id = $1 AND org_id = $2 AND site_id = $3
         FOR UPDATE`,
        [taskId, request.user.orgId, taskHint.siteId],
      );
      const task = taskResult.rows[0];
      if (!task)
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '任务不存在。',
        });
      if (now.getTime() < task.startsAt.getTime() - 60 * 60 * 1000)
        throw uploadConflict('任务尚未开放上传。');

      const templateResult = await client.query<{ aiEnabled: boolean }>(
        `SELECT ai_enabled AS "aiEnabled" FROM floorwalk.templates
         WHERE id = $1 AND org_id = $2 FOR SHARE`,
        [task.templateId, task.orgId],
      );
      const template = templateResult.rows[0];
      if (!template)
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '任务模板不存在。',
        });

      let inspectionResult = await client.query<{
        id: string;
        decidedAt: Date | null;
      }>(
        `SELECT id, decided_at AS "decidedAt"
         FROM floorwalk.inspections WHERE task_id = $1 FOR UPDATE`,
        [task.id],
      );
      if (!inspectionResult.rows[0]) {
        if (!siteResult.rows[0].active)
          throw uploadConflict('已停用门店不能开始巡检任务。');
        const templateItems = await client.query(
          `SELECT position, title, min_photo_count AS "minPhotoCount",
             acceptance_criteria AS "acceptanceCriteria", critical
           FROM floorwalk.template_items WHERE template_id = $1 ORDER BY position`,
          [task.templateId],
        );
        const created = await client.query<{ id: string }>(
          `INSERT INTO floorwalk.inspections
             (task_id, site_id, template_id, inspector_id, status)
           VALUES ($1, $2, $3, $4, 'draft') RETURNING id`,
          [task.id, task.siteId, task.templateId, request.user.id],
        );
        const inspectionId = created.rows[0].id;
        for (const item of templateItems.rows)
          await client.query(
            `INSERT INTO floorwalk.inspection_items
               (inspection_id, position, title, min_photo_count,
                acceptance_criteria, critical)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              inspectionId,
              item.position,
              item.title,
              item.minPhotoCount,
              item.acceptanceCriteria,
              item.critical,
            ],
          );
        inspectionResult = await client.query(
          `SELECT id, decided_at AS "decidedAt"
           FROM floorwalk.inspections WHERE id = $1 FOR UPDATE`,
          [inspectionId],
        );
      }
      const inspection = inspectionResult.rows[0];
      if (!inspection || inspection.decidedAt)
        throw uploadConflict('任务已完成判定，不能继续上传。');

      const itemResult = await client.query<{
        id: string;
        inspectionId: string;
        position: number;
        title: string;
        minPhotoCount: number;
        acceptanceCriteria: string;
        critical: boolean;
        result: 'pending' | 'pass' | 'rework' | 'fail';
        note: string | null;
        createdAt: Date;
        uploadedAt: Date | null;
      }>(
        `SELECT id, inspection_id AS "inspectionId", position, title,
           min_photo_count AS "minPhotoCount",
           acceptance_criteria AS "acceptanceCriteria", critical, result, note,
           created_at AS "createdAt", uploaded_at AS "uploadedAt"
         FROM floorwalk.inspection_items
         WHERE inspection_id = $1 AND position = $2 FOR UPDATE`,
        [inspection.id, itemPosition],
      );
      const item = itemResult.rows[0];
      if (!item)
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '检查项不存在。',
        });
      if (uploads.length < item.minPhotoCount)
        throw new UnprocessableEntityException({
          code: 'INCOMPLETE',
          message: `此检查项至少需要 ${item.minPhotoCount} 张照片。`,
        });
      if (uploads.length === 0 && !input.note?.trim())
        throw new UnprocessableEntityException({
          code: 'INCOMPLETE',
          message: '不拍照的检查项必须填写备注。',
        });

      const afterDeadline = now.getTime() > task.dueAt.getTime();
      const graceDeadline = task.dueAt.getTime() + 60 * 60 * 1000;
      if (afterDeadline) {
        if (!item.uploadedAt)
          throw uploadConflict('截止后不能上传尚未提交的检查项。');
        if (item.result !== 'rework' || now.getTime() > graceDeadline)
          throw uploadConflict('只有打回的检查项可以在截止后 1 小时内重传。');
      }

      for (const file of uploads) {
        const extension = file.mimetype === 'image/jpeg' ? '.jpg' : '.png';
        const key = `org/${request.user.orgId}/${task.id}/${item.id}/${randomUUID()}${extension}`;
        await storage.put(key, file.buffer, file.mimetype);
        writtenKeys.push(key);
      }

      const oldEvidence = await client.query<{ storageKey: string }>(
        `DELETE FROM floorwalk.evidence WHERE inspection_item_id = $1
         RETURNING storage_key AS "storageKey"`,
        [item.id],
      );
      oldKeys = oldEvidence.rows.map((row) => row.storageKey);
      const persisted = await client.query(
        `UPDATE floorwalk.inspection_items
         SET result = 'pending', self_assessment = $2,
           first_self_assessment = COALESCE(first_self_assessment, $2),
           first_uploaded_by_id = CASE WHEN first_self_assessment IS NULL
             THEN $3 ELSE first_uploaded_by_id END,
           uploaded_by_id = $3, uploaded_at = $4, note = $5,
           ai_reason = NULL, upload_version = upload_version + 1
         WHERE id = $1
         RETURNING id, inspection_id AS "inspectionId", position, title,
           min_photo_count AS "minPhotoCount",
           acceptance_criteria AS "acceptanceCriteria", critical, result, note,
           self_assessment AS "selfAssessment", uploaded_by_id AS "uploadedById",
           uploaded_at AS "uploadedAt", upload_version AS "uploadVersion",
           created_at AS "createdAt"`,
        [
          item.id,
          input.selfAssessment,
          request.user.id,
          now,
          input.note ?? null,
        ],
      );
      await client.query(
        `INSERT INTO floorwalk.inspection_participants (inspection_id, user_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [inspection.id, request.user.id],
      );
      const evidence = [];
      for (let index = 0; index < uploads.length; index++) {
        const file = uploads[index];
        const inserted = await client.query(
          `INSERT INTO floorwalk.evidence
             (inspection_item_id, storage_key, mime, size, created_at)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, inspection_item_id AS "inspectionItemId",
             storage_key AS "storageKey", mime, size, created_at AS "createdAt"`,
          [item.id, writtenKeys[index], file.mimetype, file.size, now],
        );
        evidence.push({
          ...inserted.rows[0],
          createdAt: iso(inserted.rows[0].createdAt),
        });
      }
      await client.query(
        `UPDATE floorwalk.inspection_tasks task
         SET status = CASE
           WHEN task.due_at <= $2 THEN 'overdue'
           WHEN NOT EXISTS (
             SELECT 1 FROM floorwalk.inspections inspection
             JOIN floorwalk.inspection_items item ON item.inspection_id = inspection.id
             WHERE inspection.task_id = task.id AND item.uploaded_at IS NULL
           ) THEN 'submitted'
           ELSE 'in_progress'
         END
         WHERE task.id = $1`,
        [task.id, now],
      );
      const response = taskItemUploadResponseSchema.parse({
        ...persisted.rows[0],
        uploadedAt: iso(persisted.rows[0].uploadedAt),
        createdAt: iso(persisted.rows[0].createdAt),
        uploadedByName: request.user.displayName,
        evidence: evidence.map((row) => evidenceSchema.parse(row)),
      });
      await this.aiReviewQueue.enqueue(client, {
        inspectionItemId: item.id,
        uploadVersion: persisted.rows[0].uploadVersion,
        uploadedAt: persisted.rows[0].uploadedAt,
        aiEnabled: template.aiEnabled,
      });
      await client.query('COMMIT');
      committed = true;
      for (const key of oldKeys)
        await storage
          .delete(key)
          .catch((error) => this.logger.warn(`旧照片清理失败：${key}`, error));
      return response;
    } catch (error) {
      if (!committed) {
        await client.query('ROLLBACK');
        for (const key of writtenKeys)
          await storage.delete(key).catch(() => undefined);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.getEvidence))
  async getEvidence(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthedRequest,
  ) {
    const result = await this.pool.query<{ storageKey: string; id: string }>(
      `SELECT evidence.storage_key AS "storageKey", inspection.id
       FROM floorwalk.evidence evidence
       JOIN floorwalk.inspection_items item ON item.id = evidence.inspection_item_id
       JOIN floorwalk.inspections inspection ON inspection.id = item.inspection_id
       WHERE evidence.id = $1`,
      [id],
    );
    const evidence = result.rows[0];
    if (!evidence)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '照片不存在。',
      });
    await getInspectionAccess(this.pool, evidence.id, request.user);
    const storage = await getStorageDriver();
    return signedEvidenceResponseSchema.parse(
      await storage.signedUrl(evidence.storageKey, 3600),
    );
  }
}

function uploadConflict(message: string) {
  return new ConflictException({ code: 'INVALID_STATE', message });
}
