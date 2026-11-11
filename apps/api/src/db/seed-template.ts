import type { PoolClient } from 'pg';
import { seedItems } from './seed-data.js';

export async function seedTemplate(client: PoolClient, orgId: string) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO floorwalk.templates (org_id, name, ai_enabled)
     VALUES ($1, '开店检查', false) RETURNING id`,
    [orgId],
  );
  const id = result.rows[0].id;
  for (const item of seedItems) {
    await client.query(
      `INSERT INTO floorwalk.template_items (template_id, position, title, min_photo_count, acceptance_criteria, critical)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        item.position,
        item.title,
        item.min_photo_count,
        item.acceptance_criteria,
        item.critical,
      ],
    );
  }
  return id;
}
