import { NotFoundException } from '@nestjs/common';
import type { ScheduleDefinition } from '@libs/shared';
import type { PoolClient } from 'pg';

export async function assertScheduleTemplates(
  client: PoolClient,
  orgId: string,
  input: ScheduleDefinition,
) {
  const templateIds = [
    ...new Set(
      input.days.flatMap((day) => day.tasks.map((task) => task.templateId)),
    ),
  ];
  if (!templateIds.length) return;
  const result = await client.query(
    'SELECT id FROM floorwalk.templates WHERE org_id = $1 AND id = ANY($2::uuid[]) FOR KEY SHARE',
    [orgId, templateIds],
  );
  if (result.rowCount !== templateIds.length)
    throw new NotFoundException({
      code: 'NOT_FOUND',
      message: '模板不存在。',
    });
}

export async function writeScheduleDays(
  client: PoolClient,
  orgId: string,
  id: string,
  input: ScheduleDefinition,
) {
  const days = JSON.stringify(input.days);
  await client.query(
    `INSERT INTO floorwalk.schedule_days (org_id, schedule_id, weekday, enabled)
     SELECT $1, $2, weekday, enabled
     FROM jsonb_to_recordset($3::jsonb) AS day(weekday integer, enabled boolean)`,
    [orgId, id, days],
  );
  await client.query(
    `INSERT INTO floorwalk.schedule_tasks
       (org_id, schedule_id, weekday, position, template_id, starts_at, ends_at)
     SELECT $1, $2, day.weekday, (task.position - 1)::integer,
       (task.value->>'templateId')::uuid,
       (task.value->>'startsAt')::time, (task.value->>'endsAt')::time
     FROM jsonb_to_recordset($3::jsonb) AS day(weekday integer, tasks jsonb)
     CROSS JOIN LATERAL jsonb_array_elements(day.tasks) WITH ORDINALITY AS task(value, position)`,
    [orgId, id, days],
  );
}
