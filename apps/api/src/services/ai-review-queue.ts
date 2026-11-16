import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { aiReviewInputSchema, type AiReviewConclusion } from '@libs/shared';
import type { Pool, PoolClient } from 'pg';
import type { AiReviewer } from '../ai/types.js';
import { DATABASE_POOL } from '../db/pool.provider.js';
import {
  TASK_SCHEDULER_CLOCK,
  type TaskSchedulerClock,
} from './task-scheduler.js';
import { getStorageDriver } from '../storage/index.js';
import { TaskDecisionService } from './task-decisions.js';

const maxAttempts = 4;
const leaseMs = 75_000;
const batchSize = 20;

type ReviewJob = {
  id: string;
  inspectionItemId: string;
  taskId: string;
  uploadVersion: number;
  uploadedAt: Date;
  attemptCount: number;
  reviewPrompt: string;
  templateName: string;
  title: string;
  critical: boolean;
  minPhotos: number;
  acceptanceCriteria: string;
  selfAssessment: 'pass' | 'fail';
};

@Injectable()
export class AiReviewQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiReviewQueueService.name);
  private timer: NodeJS.Timeout | undefined;
  private processing = false;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject('AI_REVIEWER') private readonly reviewer: AiReviewer,
    @Inject(TASK_SCHEDULER_CLOCK)
    private readonly clock: TaskSchedulerClock,
    @Inject(TaskDecisionService)
    private readonly decisions: TaskDecisionService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.processPending(), 1_000);
    this.timer.unref();
    void this.processPending();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async enqueue(
    client: Pick<PoolClient, 'query'>,
    input: {
      inspectionItemId: string;
      uploadVersion: number;
      uploadedAt: Date;
      aiEnabled: boolean;
    },
  ) {
    await client.query(
      `UPDATE floorwalk.ai_review_jobs SET status = 'cancelled'
       WHERE inspection_item_id = $1 AND status IN ('pending', 'processing')`,
      [input.inspectionItemId],
    );
    if (!input.aiEnabled) return;
    await client.query(
      `INSERT INTO floorwalk.ai_review_jobs
         (inspection_item_id, uploaded_at, upload_version, status, available_at)
       VALUES ($1, $2, $3, 'pending', $2)`,
      [input.inspectionItemId, input.uploadedAt, input.uploadVersion],
    );
  }

  async processPending(now = this.clock.now()) {
    if (this.processing) return;
    this.processing = true;
    try {
      for (let processed = 0; processed < batchSize; processed += 1) {
        const job = await this.claimNext(now);
        if (!job) break;
        try {
          await this.review(job);
        } catch {
          await this.retryOrRequestManual(job, this.clock.now());
        }
      }
    } catch {
      this.logger.error('AI 审核队列处理失败。');
    } finally {
      this.processing = false;
    }
  }

  private async claimNext(now: Date): Promise<ReviewJob | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE floorwalk.ai_review_jobs job SET status = 'cancelled'
         FROM floorwalk.inspection_items item
         WHERE item.id = job.inspection_item_id
           AND job.status IN ('pending', 'processing')
           AND (item.upload_version <> job.upload_version
             OR item.uploaded_at IS DISTINCT FROM job.uploaded_at
             OR item.result <> 'pending')`,
      );
      await client.query(
        `UPDATE floorwalk.ai_review_jobs job SET status = 'manual'
         FROM floorwalk.inspection_items item
         JOIN floorwalk.inspections inspection ON inspection.id = item.inspection_id
         JOIN floorwalk.templates template ON template.id = inspection.template_id
         WHERE job.inspection_item_id = item.id
           AND job.upload_version = item.upload_version
           AND job.status IN ('pending', 'processing')
           AND NOT template.ai_enabled`,
      );
      await client.query(
        `UPDATE floorwalk.ai_review_jobs SET status = 'manual'
         WHERE status = 'processing' AND available_at <= $1
           AND attempt_count >= $2`,
        [now, maxAttempts],
      );
      const selected = await client.query<ReviewJob>(
        `SELECT job.id, job.inspection_item_id AS "inspectionItemId",
           inspection.task_id AS "taskId",
           job.upload_version AS "uploadVersion", job.uploaded_at AS "uploadedAt",
           job.attempt_count AS "attemptCount", standard.prompt AS "reviewPrompt",
           template.name AS "templateName", item.title, item.critical,
           item.min_photo_count AS "minPhotos",
           item.acceptance_criteria AS "acceptanceCriteria",
           item.self_assessment AS "selfAssessment"
         FROM floorwalk.ai_review_jobs job
         JOIN floorwalk.inspection_items item
           ON item.id = job.inspection_item_id
         JOIN floorwalk.inspections inspection
           ON inspection.id = item.inspection_id
         JOIN floorwalk.templates template
           ON template.id = inspection.template_id
         LEFT JOIN floorwalk.ai_review_standards standard
           ON standard.id = template.ai_standard_id
           AND standard.org_id = template.org_id
         WHERE job.status IN ('pending', 'processing')
           AND job.available_at <= $1 AND job.attempt_count < $2
           AND template.ai_enabled
           AND item.upload_version = job.upload_version
           AND item.uploaded_at = job.uploaded_at
           AND item.result = 'pending'
           AND item.self_assessment IS NOT NULL
         ORDER BY job.available_at, job.created_at, job.id
         FOR UPDATE OF job SKIP LOCKED
         LIMIT 1`,
        [now, maxAttempts],
      );
      const job = selected.rows[0];
      if (!job) {
        await client.query('COMMIT');
        return null;
      }
      const claimed = await client.query<{ attemptCount: number }>(
        `UPDATE floorwalk.ai_review_jobs
         SET status = 'processing', attempt_count = attempt_count + 1,
           available_at = $2
         WHERE id = $1 RETURNING attempt_count AS "attemptCount"`,
        [job.id, new Date(now.getTime() + leaseMs)],
      );
      await client.query('COMMIT');
      return { ...job, attemptCount: claimed.rows[0].attemptCount };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async review(job: ReviewJob) {
    const evidence = await this.pool.query<{ storageKey: string }>(
      `SELECT storage_key AS "storageKey" FROM floorwalk.evidence
       WHERE inspection_item_id = $1 ORDER BY created_at, id`,
      [job.inspectionItemId],
    );
    const storage = await getStorageDriver();
    const photos = await Promise.all(
      evidence.rows.map(async ({ storageKey }) => ({
        kind: 'url' as const,
        url: (await storage.signedUrl(storageKey, 300)).url,
      })),
    );
    const input = aiReviewInputSchema.parse({
      reviewPrompt: job.reviewPrompt,
      templateName: job.templateName,
      items: [
        {
          itemId: job.inspectionItemId,
          title: job.title,
          critical: job.critical,
          minPhotos: job.minPhotos,
          acceptanceCriteria: job.acceptanceCriteria,
          selfResult: job.selfAssessment,
          expectedConclusion: job.selfAssessment,
          photos,
        },
      ],
    });
    const result = await this.reviewer.review(input);
    if ('kind' in result) {
      await this.retryOrRequestManual(job, this.clock.now());
      return;
    }
    const decision = result.items.find(
      (item) => item.itemId === job.inspectionItemId,
    );
    if (!decision) {
      await this.retryOrRequestManual(job, this.clock.now());
      return;
    }
    await this.complete(job, decision.verdict, decision.reason);
  }

  private async complete(
    job: ReviewJob,
    result: AiReviewConclusion,
    reason: string | null,
  ) {
    const client = await this.pool.connect();
    let completed: boolean;
    try {
      await client.query('BEGIN');
      const applied = await client.query(
        `UPDATE floorwalk.inspection_items item
         SET result = $3, first_result = COALESCE(first_result, $3), ai_reason = $4
         WHERE item.id = $1 AND item.upload_version = $2
           AND item.result = 'pending'
           AND EXISTS (SELECT 1 FROM floorwalk.ai_review_jobs job
             WHERE job.id = $5 AND job.status = 'processing'
               AND job.attempt_count = $6)`,
        [
          job.inspectionItemId,
          job.uploadVersion,
          result,
          reason,
          job.id,
          job.attemptCount,
        ],
      );
      await client.query(
        `UPDATE floorwalk.ai_review_jobs SET status = $2, conclusion = $3
         WHERE id = $1 AND status = 'processing' AND attempt_count = $4`,
        [
          job.id,
          applied.rowCount ? 'completed' : 'cancelled',
          applied.rowCount ? result : null,
          job.attemptCount,
        ],
      );
      await client.query('COMMIT');
      completed = Boolean(applied.rowCount);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    if (completed)
      await this.decisions.finalizeTask(job.taskId, this.clock.now());
  }

  private async retryOrRequestManual(job: ReviewJob, now: Date) {
    const delayMs = 1_000 * 2 ** Math.max(0, job.attemptCount - 1);
    const client = await this.pool.connect();
    let rescheduled: boolean;
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        `UPDATE floorwalk.ai_review_jobs job
         SET status = CASE WHEN job.attempt_count >= $3 THEN 'manual' ELSE 'pending' END,
           available_at = CASE WHEN job.attempt_count >= $3 THEN job.available_at
             ELSE $2::timestamptz + ($4::int * interval '1 millisecond') END
         WHERE job.id = $1 AND job.status = 'processing' AND attempt_count = $5
           AND EXISTS (SELECT 1 FROM floorwalk.inspection_items item
             WHERE item.id = job.inspection_item_id
               AND item.upload_version = job.upload_version
               AND item.result = 'pending')`,
        [job.id, now, maxAttempts, delayMs, job.attemptCount],
      );
      rescheduled = Boolean(updated.rowCount);
      if (!updated.rowCount) {
        await client.query(
          `UPDATE floorwalk.ai_review_jobs SET status = 'cancelled'
           WHERE id = $1 AND status = 'processing' AND attempt_count = $2`,
          [job.id, job.attemptCount],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    if (rescheduled)
      this.logger.warn(
        job.attemptCount >= maxAttempts
          ? 'AI 审核重试耗尽，条目转待人工。'
          : 'AI 审核失败，已安排重试。',
      );
  }
}
