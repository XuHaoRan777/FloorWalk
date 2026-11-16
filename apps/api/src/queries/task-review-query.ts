import { NotFoundException } from '@nestjs/common';
import {
  taskReviewQueueResponseSchema,
  taskReviewSchema,
  type TaskReview,
} from '@libs/shared';
import type { Pool } from 'pg';
import { iso } from './inspection-queries.js';

export async function listReviewQueue(pool: Pool, orgId: string) {
  const tasks = await pool.query<{ id: string }>(
    `SELECT task.id FROM floorwalk.inspection_tasks task
     JOIN floorwalk.organizations org ON org.id = task.org_id
     JOIN floorwalk.inspections inspection ON inspection.task_id = task.id
     WHERE task.org_id = $1 AND (
       (
         inspection.decided_at >= (
           date_trunc('day', now() AT TIME ZONE org.timezone)
           AT TIME ZONE org.timezone
         )
         AND inspection.decided_at < (
           (date_trunc('day', now() AT TIME ZONE org.timezone) + interval '1 day')
           AT TIME ZONE org.timezone
         )
       ) OR EXISTS (
         SELECT 1 FROM floorwalk.inspection_items item
         JOIN floorwalk.templates template ON template.id = inspection.template_id
         LEFT JOIN LATERAL (
           SELECT job.status FROM floorwalk.ai_review_jobs job
           WHERE job.inspection_item_id = item.id
             AND job.upload_version = item.upload_version
           ORDER BY job.created_at DESC, job.id DESC LIMIT 1
         ) ai_job ON true
         WHERE item.inspection_id = inspection.id
           AND item.uploaded_at IS NOT NULL
           AND item.result = 'pending'
           AND (NOT template.ai_enabled OR ai_job.status IS NULL OR ai_job.status = 'manual')
       )
     )
     ORDER BY task.task_date DESC, task.starts_at DESC, task.id`,
    [orgId],
  );
  const reviews = await Promise.all(
    tasks.rows.map((task) => loadTaskReview(pool, task.id, orgId)),
  );
  return taskReviewQueueResponseSchema.parse(reviews);
}

export async function loadTaskReview(
  pool: Pool,
  taskId: string,
  orgId: string,
): Promise<TaskReview> {
  const task = await pool.query(
    `SELECT task.id, task.site_id AS "siteId", task.template_id AS "templateId",
       task.task_date::text AS "taskDate", task.position, task.starts_at AS "startsAt",
       task.due_at AS "dueAt", task.status, task.created_at AS "createdAt",
       inspection.id AS "inspectionId", inspection.status AS "inspectionStatus",
       inspection.score, inspection.submitted_at AS "submittedAt",
       inspection.decided_at AS "decidedAt", site.id AS "reviewSiteId",
       site.code AS "siteCode", site.name AS "siteName",
       site.deactivated_at IS NULL AS "siteActive", site.created_at AS "siteCreatedAt",
       template.name AS "templateName"
     FROM floorwalk.inspection_tasks task
     JOIN floorwalk.sites site ON site.id = task.site_id
     JOIN floorwalk.templates template ON template.id = task.template_id
     LEFT JOIN floorwalk.inspections inspection ON inspection.task_id = task.id
     WHERE task.id = $1 AND task.org_id = $2`,
    [taskId, orgId],
  );
  const row = task.rows[0];
  if (!row)
    throw new NotFoundException({
      code: 'NOT_FOUND',
      message: '任务不存在。',
    });
  const items = [];
  if (row.inspectionId) {
    const inspectionItems = await pool.query(
      `SELECT item.id, item.inspection_id AS "inspectionId", item.position,
         item.title, item.min_photo_count AS "minPhotoCount",
         item.acceptance_criteria AS "acceptanceCriteria", item.critical,
         item.result, item.self_assessment AS "selfAssessment",
         item.first_self_assessment AS "firstSelfAssessment",
         item.first_result AS "firstResult", item.uploaded_by_id AS "uploadedById",
         item.ai_reason AS "aiReason",
         last_rework.reason AS "lastReworkReason",
         CASE WHEN item.result = 'pending' AND item.uploaded_at IS NOT NULL
           AND (NOT template.ai_enabled OR ai_job.status IS NULL) THEN 'manual'
           ELSE ai_job.status END AS "aiReviewStatus",
         uploader.display_name AS "uploadedByName", item.uploaded_at AS "uploadedAt",
         item.incomplete, item.note, item.created_at AS "createdAt"
       FROM floorwalk.inspection_items item
       JOIN floorwalk.inspections inspection ON inspection.id = item.inspection_id
       JOIN floorwalk.templates template ON template.id = inspection.template_id
       LEFT JOIN floorwalk.users uploader ON uploader.id = item.uploaded_by_id
       LEFT JOIN LATERAL (
         SELECT job.status FROM floorwalk.ai_review_jobs job
         WHERE job.inspection_item_id = item.id
           AND job.upload_version = item.upload_version
         ORDER BY job.created_at DESC, job.id DESC LIMIT 1
       ) ai_job ON true
       LEFT JOIN LATERAL (
         SELECT decision.reason FROM floorwalk.inspection_item_decisions decision
         WHERE decision.inspection_item_id = item.id AND decision.reason IS NOT NULL
         ORDER BY decision.created_at DESC, decision.id DESC LIMIT 1
       ) last_rework ON true
       WHERE item.inspection_id = $1 ORDER BY item.position`,
      [row.inspectionId],
    );
    for (const item of inspectionItems.rows) {
      const evidence = await pool.query(
        `SELECT id, inspection_item_id AS "inspectionItemId", storage_key AS "storageKey",
           mime, size, created_at AS "createdAt"
         FROM floorwalk.evidence WHERE inspection_item_id = $1
         ORDER BY created_at, id`,
        [item.id],
      );
      items.push({
        ...item,
        createdAt: iso(item.createdAt),
        uploadedAt: iso(item.uploadedAt),
        evidence: evidence.rows.map((photo) => ({
          ...photo,
          createdAt: iso(photo.createdAt),
        })),
      });
    }
  }
  return taskReviewSchema.parse({
    id: row.id,
    siteId: row.siteId,
    templateId: row.templateId,
    taskDate: row.taskDate,
    position: row.position,
    startsAt: iso(row.startsAt),
    dueAt: iso(row.dueAt),
    status: row.status,
    createdAt: iso(row.createdAt),
    inspectionId: row.inspectionId,
    inspectionStatus: row.inspectionStatus,
    score: row.score,
    submittedAt: iso(row.submittedAt),
    decidedAt: iso(row.decidedAt),
    site: {
      id: row.reviewSiteId,
      code: row.siteCode,
      name: row.siteName,
      active: row.siteActive,
      createdAt: iso(row.siteCreatedAt),
    },
    templateName: row.templateName,
    items,
  });
}
