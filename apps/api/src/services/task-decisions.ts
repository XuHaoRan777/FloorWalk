import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  calculateInspectionScore,
  type InspectionItemDecisionResult,
  type TaskReview,
} from '@libs/shared';
import type { Pool, PoolClient } from 'pg';
import { DATABASE_POOL } from '../db/pool.provider.js';
import { notifyInspectionDecided, notifyItemResult } from './notifications.js';
import {
  listReviewQueue,
  loadTaskReview,
} from '../queries/task-review-query.js';

type TaskRow = {
  id: string;
  orgId: string;
  siteId: string;
  templateId: string;
  dueAt: Date;
};

type DecisionItemRow = {
  id: string;
  result: InspectionItemDecisionResult | 'pending';
  critical: boolean;
  uploadedAt: Date | null;
  incomplete: boolean;
};

@Injectable()
export class TaskDecisionService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async listReviewQueue(orgId: string) {
    return listReviewQueue(this.pool, orgId);
  }

  async getTaskReview(taskId: string, orgId: string) {
    return loadTaskReview(this.pool, taskId, orgId);
  }

  async decideTaskItem(input: {
    taskId: string;
    itemId: string;
    orgId: string;
    actorId: string;
    result: InspectionItemDecisionResult;
    reason: string | null;
    now: Date;
  }): Promise<TaskReview> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const task = await this.lockTask(client, input.taskId, input.orgId);
      const inspectionResult = await client.query<{
        id: string;
        decidedAt: Date | null;
      }>(
        `SELECT id, decided_at AS "decidedAt"
         FROM floorwalk.inspections WHERE task_id = $1 FOR UPDATE`,
        [task.id],
      );
      const inspection = inspectionResult.rows[0];
      if (!inspection)
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '任务巡检单不存在。',
        });
      const itemResult = await client.query<{
        result: DecisionItemRow['result'];
        uploadedAt: Date | null;
        incomplete: boolean;
      }>(
        `SELECT result, uploaded_at AS "uploadedAt", incomplete
         FROM floorwalk.inspection_items
         WHERE id = $1 AND inspection_id = $2 FOR UPDATE`,
        [input.itemId, inspection.id],
      );
      const item = itemResult.rows[0];
      if (!item)
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '检查项不存在。',
        });
      if (!item.uploadedAt && !inspection.decidedAt)
        throw new ConflictException({
          code: 'INVALID_STATE',
          message: '未上传的检查项将在截止判定时自动处理。',
        });
      if (
        input.result === 'rework' &&
        input.now.getTime() >= task.dueAt.getTime() + 60 * 60 * 1000
      )
        throw decisionConflict('截止后 1 小时只能判通过或不合格。');
      if (item.result === input.result)
        throw decisionConflict('该检查项已经是此结论。');

      const previousResult = item.result === 'pending' ? null : item.result;
      await client.query(
        `UPDATE floorwalk.inspection_items
         SET result = $2, first_result = COALESCE(first_result, $2)
         WHERE id = $1`,
        [input.itemId, input.result],
      );
      await client.query(
        `UPDATE floorwalk.ai_review_jobs SET status = 'cancelled'
         WHERE inspection_item_id = $1 AND status IN ('pending', 'processing')`,
        [input.itemId],
      );
      await client.query(
        `INSERT INTO floorwalk.inspection_item_decisions
           (inspection_item_id, actor_id, previous_result, new_result, reason, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.itemId,
          input.actorId,
          previousResult,
          input.result,
          input.reason,
          input.now,
        ],
      );
      await notifyItemResult(
        client,
        input.itemId,
        input.result,
        input.reason,
        previousResult !== null,
      );

      if (inspection.decidedAt) {
        await this.recalculateLockedInspection(
          client,
          inspection.id,
          inspection.decidedAt,
        );
      } else if (input.now.getTime() >= task.dueAt.getTime()) {
        await this.finalizeLockedTask(client, task, inspection.id, input.now);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return loadTaskReview(this.pool, input.taskId, input.orgId);
  }

  async processDueTasks(now = new Date()) {
    const due = await this.pool.query<{ id: string }>(
      `SELECT task.id FROM floorwalk.inspection_tasks task
       LEFT JOIN floorwalk.inspections inspection ON inspection.task_id = task.id
       WHERE task.due_at <= $1 AND
         (inspection.id IS NULL OR inspection.decided_at IS NULL)
       ORDER BY task.due_at, task.id`,
      [now],
    );
    for (const task of due.rows) await this.finalizeTask(task.id, now);
  }

  async finalizeTask(taskId: string, now: Date) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const task = await this.lockTask(client, taskId);
      if (task.dueAt.getTime() > now.getTime()) {
        await client.query('COMMIT');
        return;
      }
      let inspection = await client.query<{
        id: string;
        decidedAt: Date | null;
      }>(
        `SELECT id, decided_at AS "decidedAt"
         FROM floorwalk.inspections WHERE task_id = $1 FOR UPDATE`,
        [task.id],
      );
      if (!inspection.rows[0]) {
        const template = await client.query(
          `SELECT id FROM floorwalk.templates
           WHERE id = $1 AND org_id = $2 FOR SHARE`,
          [task.templateId, task.orgId],
        );
        if (!template.rowCount)
          throw new NotFoundException({
            code: 'NOT_FOUND',
            message: '任务模板不存在。',
          });
        const templateItems = await client.query(
          `SELECT position, title, min_photo_count AS "minPhotoCount",
             acceptance_criteria AS "acceptanceCriteria", critical
           FROM floorwalk.template_items WHERE template_id = $1 ORDER BY position`,
          [task.templateId],
        );
        const created = await client.query<{ id: string }>(
          `INSERT INTO floorwalk.inspections
             (task_id, site_id, template_id, inspector_id, status)
           VALUES ($1, $2, $3, NULL, 'draft') RETURNING id`,
          [task.id, task.siteId, task.templateId],
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
        inspection = await client.query(
          `SELECT id, decided_at AS "decidedAt"
           FROM floorwalk.inspections WHERE id = $1 FOR UPDATE`,
          [inspectionId],
        );
      }
      const current = inspection.rows[0];
      if (!current || current.decidedAt) {
        await client.query('COMMIT');
        return;
      }
      await this.finalizeLockedTask(client, task, current.id, now);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async finalizeLockedTask(
    client: PoolClient,
    task: TaskRow,
    inspectionId: string,
    now: Date,
  ) {
    const items = await client.query<DecisionItemRow>(
      `SELECT id, result, critical, uploaded_at AS "uploadedAt", incomplete
       FROM floorwalk.inspection_items WHERE inspection_id = $1
       ORDER BY position FOR UPDATE`,
      [inspectionId],
    );
    if (!items.rows.length) return;
    const hasRework = items.rows.some((item) => item.result === 'rework');
    const graceDeadline = task.dueAt.getTime() + 60 * 60 * 1000;
    if (hasRework && now.getTime() < graceDeadline) return;

    for (const item of items.rows) {
      if (
        item.result === 'pending' ||
        (item.result === 'rework' && now.getTime() >= graceDeadline)
      ) {
        await client.query(
          `UPDATE floorwalk.inspection_items
           SET result = 'fail', first_result = COALESCE(first_result, 'fail'),
             incomplete = $2
           WHERE id = $1`,
          [item.id, !item.uploadedAt || item.result === 'rework'],
        );
        await notifyItemResult(client, item.id, 'fail', null);
      } else {
        await client.query(
          `UPDATE floorwalk.inspection_items
           SET first_result = COALESCE(first_result, result)
           WHERE id = $1 AND result IN ('pass', 'fail')`,
          [item.id],
        );
      }
    }
    const settled = await client.query<DecisionItemRow>(
      `SELECT id, result, critical, uploaded_at AS "uploadedAt", incomplete
       FROM floorwalk.inspection_items WHERE inspection_id = $1 ORDER BY position`,
      [inspectionId],
    );
    const results = settled.rows.map((item) => item.result);
    const score = calculateInspectionScore(results);
    const failedCount = settled.rows.filter(
      (item) => item.result === 'fail',
    ).length;
    const overallStatus =
      settled.rows.some((item) => item.critical && item.result === 'fail') ||
      failedCount * 2 >= settled.rows.length
        ? 'failed'
        : 'passed';
    const priorRework = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM floorwalk.inspection_item_decisions decision
         JOIN floorwalk.inspection_items item ON item.id = decision.inspection_item_id
         WHERE item.inspection_id = $1 AND decision.new_result = 'rework'
       ) OR EXISTS (
         SELECT 1 FROM floorwalk.inspection_items item
         WHERE item.inspection_id = $1 AND item.first_result = 'rework'
       ) OR EXISTS (
         SELECT 1 FROM floorwalk.ai_review_jobs job
         JOIN floorwalk.inspection_items item ON item.id = job.inspection_item_id
         WHERE item.inspection_id = $1 AND job.conclusion = 'rework'
       ) AS exists`,
      [inspectionId],
    );
    const decidedAt =
      now.getTime() >= graceDeadline
        ? new Date(graceDeadline)
        : priorRework.rows[0]?.exists
          ? now
          : task.dueAt;
    await client.query(
      `UPDATE floorwalk.inspections SET status = $2, score = $3, decided_at = $4
       WHERE id = $1 AND decided_at IS NULL`,
      [inspectionId, overallStatus, score, decidedAt],
    );
    await notifyInspectionDecided(
      client,
      task.id,
      inspectionId,
      overallStatus,
      score,
    );
  }

  private async recalculateLockedInspection(
    client: PoolClient,
    inspectionId: string,
    decidedAt: Date,
  ) {
    const items = await client.query<DecisionItemRow>(
      `SELECT id, result, critical, uploaded_at AS "uploadedAt", incomplete
       FROM floorwalk.inspection_items WHERE inspection_id = $1 ORDER BY position`,
      [inspectionId],
    );
    if (!items.rows.length) return;
    const score = calculateInspectionScore(
      items.rows.map((item) => item.result),
    );
    const failedCount = items.rows.filter(
      (item) => item.result === 'fail',
    ).length;
    const overallStatus =
      items.rows.some((item) => item.critical && item.result === 'fail') ||
      failedCount * 2 >= items.rows.length
        ? 'failed'
        : 'passed';
    await client.query(
      `UPDATE floorwalk.inspections SET status = $2, score = $3, decided_at = $4
       WHERE id = $1`,
      [inspectionId, overallStatus, score, decidedAt],
    );
  }

  private async lockTask(
    client: PoolClient,
    taskId: string,
    orgId?: string,
  ): Promise<TaskRow> {
    const result = await client.query<TaskRow>(
      `SELECT id, org_id AS "orgId", site_id AS "siteId",
         template_id AS "templateId", due_at AS "dueAt"
       FROM floorwalk.inspection_tasks
       WHERE id = $1 AND ($2::uuid IS NULL OR org_id = $2)
       FOR UPDATE`,
      [taskId, orgId ?? null],
    );
    if (!result.rows[0])
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: '任务不存在。',
      });
    return result.rows[0];
  }
}

function decisionConflict(message: string) {
  return new ConflictException({ code: 'INVALID_STATE', message });
}
