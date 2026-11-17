import type { Notification } from '@libs/shared';
import type { Pool, PoolClient } from 'pg';

type Client = Pick<PoolClient, 'query'>;
type Event = {
  [Type in Notification['type']]: Pick<
    Extract<Notification, { type: Type }>,
    'type' | 'payload'
  >;
}[Notification['type']];

export async function notifyTask(
  client: Client,
  taskId: string,
  audience: 'admin' | 'store_manager',
  event: Event,
) {
  await client.query(
    `INSERT INTO floorwalk.notifications (org_id, user_id, type, payload_json)
     SELECT task.org_id, recipient.id, $3, $4::jsonb
     FROM floorwalk.inspection_tasks task
     JOIN floorwalk.users recipient ON recipient.org_id = task.org_id
       AND recipient.role = $2
       AND ($2 = 'admin' OR recipient.site_id = task.site_id)
     WHERE task.id = $1`,
    [taskId, audience, event.type, JSON.stringify(event.payload)],
  );
}

export async function expireDueTasks(pool: Pick<Pool, 'connect'>, now: Date) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const expired = await client.query<{ id: string }>(
      `UPDATE floorwalk.inspection_tasks
       SET status = 'overdue'
       WHERE status IN ('not_started', 'in_progress') AND due_at <= $1
       RETURNING id`,
      [now],
    );
    for (const task of expired.rows)
      await notifyTask(client, task.id, 'admin', {
        type: 'task_overdue',
        payload: { taskId: task.id },
      });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function notifyInspectionDecided(
  client: Client,
  taskId: string,
  inspectionId: string,
  status: 'passed' | 'failed',
  score: number,
) {
  await notifyTask(client, taskId, 'store_manager', {
    type: 'inspection_decided',
    payload: { taskId, inspectionId, status, score },
  });
}

async function itemContext(client: Client, itemId: string) {
  const result = await client.query<{
    taskId: string;
    inspectionId: string;
    position: number;
    critical: boolean;
  }>(
    `SELECT inspection.task_id AS "taskId", inspection.id AS "inspectionId",
       item.position, item.critical
     FROM floorwalk.inspection_items item
     JOIN floorwalk.inspections inspection ON inspection.id = item.inspection_id
     WHERE item.id = $1 AND inspection.task_id IS NOT NULL`,
    [itemId],
  );
  return result.rows[0];
}

export async function notifyItemResult(
  client: Client,
  itemId: string,
  result: 'pass' | 'fail' | 'rework',
  reason: string | null,
  overridden = false,
) {
  const item = await itemContext(client, itemId);
  if (!item) return;
  const { taskId, inspectionId, position } = item;
  const payload = { taskId, inspectionId, position };
  if (result === 'rework')
    await notifyTask(client, taskId, 'store_manager', {
      type: 'item_rework',
      payload: { ...payload, reason: reason ?? '请补充现场照片与说明。' },
    });
  if (result === 'fail' && item.critical)
    await notifyTask(client, taskId, 'admin', {
      type: 'critical_item_failed',
      payload,
    });
  if (overridden)
    await notifyTask(client, taskId, 'store_manager', {
      type: 'inspection_overridden',
      payload,
    });
}

export async function notifyManualReview(client: Client, itemId: string) {
  const item = await itemContext(client, itemId);
  if (!item) return;
  await notifyTask(client, item.taskId, 'admin', {
    type: 'manual_review_needed',
    payload: {
      taskId: item.taskId,
      inspectionId: item.inspectionId,
      position: item.position,
    },
  });
}

export async function notifyChat(
  client: Client,
  inspectionId: string,
  authorId: string,
) {
  const event: Event = { type: 'chat_message', payload: { inspectionId } };
  await client.query(
    `INSERT INTO floorwalk.notifications (org_id, user_id, type, payload_json)
     SELECT site.org_id, recipient.id, $3, $4::jsonb
     FROM floorwalk.inspections inspection
     JOIN floorwalk.sites site ON site.id = inspection.site_id
     JOIN floorwalk.users recipient ON recipient.org_id = site.org_id
       AND (recipient.role = 'admin' OR recipient.site_id = site.id)
     WHERE inspection.id = $1 AND recipient.id <> $2`,
    [inspectionId, authorId, event.type, JSON.stringify(event.payload)],
  );
}
