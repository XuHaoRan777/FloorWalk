import type { PoolClient } from 'pg';
import type { StorageDriver } from '../storage/types.js';
import { seedItems, seedPhoto } from './seed-data.js';

export async function seedHistoricalInspection(
  client: PoolClient,
  storage: StorageDriver,
  writtenKeys: string[],
  input: {
    orgId: string;
    siteId: string;
    templateId: string;
    inspectorId: string;
    status: 'failed' | 'rework' | 'submitted' | 'passed';
    createdAt: Date;
    failPosition: number | null;
    reviewerId: string | null;
  },
) {
  const submittedAt = new Date(input.createdAt.getTime() + 60 * 60 * 1000);
  const taskDate = input.createdAt.toISOString().slice(0, 10);
  const startsAt = new Date(`${taskDate}T08:00:00.000Z`);
  const dueAt = new Date(`${taskDate}T20:00:00.000Z`);
  const occurrence = await client.query<{ occurrence: number }>(
    `SELECT COALESCE(MAX(occurrence), -1) + 1 AS occurrence
     FROM floorwalk.inspection_tasks
     WHERE org_id = $1 AND site_id = $2 AND task_date = $3::date
       AND template_id = $4 AND starts_at = $5 AND due_at = $6`,
    [input.orgId, input.siteId, taskDate, input.templateId, startsAt, dueAt],
  );
  const taskResult = await client.query<{ id: string }>(
    `INSERT INTO floorwalk.inspection_tasks
       (org_id, site_id, template_id, task_date, position, occurrence,
        starts_at, due_at, status, created_at)
     VALUES ($1, $2, $3, $4::date, 0, $5, $6, $7, 'submitted', $8)
     RETURNING id`,
    [
      input.orgId,
      input.siteId,
      input.templateId,
      taskDate,
      occurrence.rows[0].occurrence,
      startsAt,
      dueAt,
      input.createdAt,
    ],
  );
  const taskId = taskResult.rows[0].id;
  const decidedAt =
    input.status === 'rework'
      ? null
      : new Date(dueAt.getTime() + input.createdAt.getUTCMinutes() * 60 * 1000);
  const inspectionResult = await client.query<{ id: string }>(
    `INSERT INTO floorwalk.inspections
      (task_id, site_id, template_id, inspector_id, status, score,
       submitted_at, decided_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      taskId,
      input.siteId,
      input.templateId,
      input.inspectorId,
      input.status,
      null,
      submittedAt,
      decidedAt,
      input.createdAt,
    ],
  );
  const inspectionId = inspectionResult.rows[0].id;
  await client.query(
    'INSERT INTO floorwalk.inspection_participants (inspection_id, user_id) VALUES ($1, $2)',
    [inspectionId, input.inspectorId],
  );
  let passedItems = 0;
  for (const item of seedItems) {
    const shouldFail =
      input.status === 'failed'
        ? item.position <= Math.ceil(seedItems.length / 2)
        : input.failPosition === item.position;
    const result =
      input.status === 'rework' && input.failPosition === item.position
        ? 'rework'
        : shouldFail
          ? 'fail'
          : 'pass';
    if (result === 'pass') passedItems += 1;
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO floorwalk.inspection_items
        (inspection_id, position, title, min_photo_count, acceptance_criteria,
         critical, result, self_assessment, first_self_assessment, first_result,
         uploaded_by_id, first_uploaded_by_id, uploaded_at, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $7, $9, $9, $10, $11, $12)
       RETURNING id`,
      [
        inspectionId,
        item.position,
        item.title,
        item.min_photo_count,
        item.acceptance_criteria,
        item.critical,
        result,
        result === 'fail' ? 'fail' : 'pass',
        input.inspectorId,
        submittedAt,
        item.min_photo_count === 0 ? '现场已检查' : null,
        input.createdAt,
      ],
    );
    if (input.reviewerId)
      await client.query(
        `INSERT INTO floorwalk.inspection_item_decisions
           (inspection_item_id, actor_id, previous_result, new_result, created_at)
         VALUES ($1, $2, NULL, $3, $4)`,
        [inserted.rows[0].id, input.reviewerId, result, decidedAt ?? dueAt],
      );
    if (item.min_photo_count > 0) {
      const storageKey = `org/${input.orgId}/seed/${inspectionId}/${inserted.rows[0].id}.jpg`;
      writtenKeys.push(storageKey);
      await storage.put(storageKey, seedPhoto, 'image/jpeg');
      await client.query(
        `INSERT INTO floorwalk.evidence
          (inspection_item_id, storage_key, mime, size, created_at)
         VALUES ($1, $2, 'image/jpeg', $3, $4)`,
        [
          inserted.rows[0].id,
          storageKey,
          seedPhoto.byteLength,
          input.createdAt,
        ],
      );
    }
  }
  const score = Math.floor((passedItems / seedItems.length) * 100 + 0.5);
  await client.query(
    'UPDATE floorwalk.inspections SET score = $1 WHERE id = $2',
    [score, inspectionId],
  );
}
