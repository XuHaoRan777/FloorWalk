import argon2 from 'argon2';
import { fileURLToPath } from 'node:url';
import { createPool, getDatabaseUrl } from './client.js';

const DEMO_PASSWORD = 'northbean-demo';
const templateItems = [
  ['门头灯箱', false],
  ['地面清洁', false],
  ['冷柜温度', true],
  ['食品效期', true],
  ['收银台整洁', false],
  ['物料陈列', false],
  ['员工着装', false],
  ['闭店记录', false],
] as const;

export async function seedDatabase(databaseUrl = getDatabaseUrl()) {
  const pool = createPool(databaseUrl);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'TRUNCATE TABLE floorwalk.reviews, floorwalk.evidence, floorwalk.inspection_items, floorwalk.inspections RESTART IDENTITY CASCADE',
    );

    const sites = new Map<string, string>();
    for (let index = 1; index <= 12; index += 1) {
      const code = `NB-${String(index).padStart(3, '0')}`;
      const result = await client.query<{ id: string }>(
        `INSERT INTO floorwalk.sites (code, name)
         VALUES ($1, $2)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [code, `Northbean Coffee ${index}`],
      );
      sites.set(code, result.rows[0].id);
    }

    const templateResult = await client.query<{ id: string }>(
      `INSERT INTO floorwalk.templates (name)
       VALUES ('开店检查')
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    );
    const templateId = templateResult.rows[0].id;
    await client.query(
      'DELETE FROM floorwalk.template_items WHERE template_id = $1',
      [templateId],
    );
    for (let index = 0; index < templateItems.length; index += 1) {
      const [title, photoRequired] = templateItems[index];
      await client.query(
        `INSERT INTO floorwalk.template_items (template_id, position, title, photo_required, critical)
         VALUES ($1, $2, $3, $4, false)`,
        [templateId, index + 1, title, photoRequired],
      );
    }

    const passwordHash = await argon2.hash(DEMO_PASSWORD);
    const accounts = [
      [
        'inspector@northbean.example',
        'Northbean 店员',
        'inspector',
        sites.get('NB-001'),
      ],
      ['supervisor@northbean.example', 'Northbean 主管', 'supervisor', null],
      ['hq@northbean.example', 'Northbean 总部', 'hq', null],
    ] as const;
    const users = new Map<string, string>();
    for (const [email, displayName, role, siteId] of accounts) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO floorwalk.users (email, password_hash, display_name, role, site_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash,
           display_name = EXCLUDED.display_name, role = EXCLUDED.role, site_id = EXCLUDED.site_id
         RETURNING id`,
        [email, passwordHash, displayName, role, siteId],
      );
      users.set(role, result.rows[0].id);
    }

    const itemRows = await client.query<{
      position: number;
      title: string;
      photo_required: boolean;
      critical: boolean;
    }>(
      'SELECT position, title, photo_required, critical FROM floorwalk.template_items WHERE template_id = $1 ORDER BY position',
      [templateId],
    );
    const inspectorId = users.get('inspector');
    if (!inspectorId) throw new Error('演示店员创建失败。');

    for (let index = 1; index <= 12; index += 1) {
      const code = `NB-${String(index).padStart(3, '0')}`;
      const siteId = sites.get(code);
      if (!siteId) throw new Error(`门店 ${code} 创建失败。`);
      const score = index === 1 ? 88 : 100;
      const inspectionResult = await client.query<{ id: string }>(
        `INSERT INTO floorwalk.inspections (site_id, template_id, inspector_id, status, score, submitted_at, decided_at)
         VALUES ($1, $2, $3, 'passed', $4, now() - interval '2 days', now() - interval '1 day')
         RETURNING id`,
        [siteId, templateId, inspectorId, score],
      );
      await insertInspectionItems(
        client,
        inspectionResult.rows[0].id,
        itemRows.rows,
        index === 1,
      );
    }

    for (const status of [
      'failed',
      'rework',
      'failed',
      'rework',
      'failed',
      'rework',
      'failed',
      'rework',
    ] as const) {
      const siteId = sites.get('NB-001');
      if (!siteId) throw new Error('演示门店不存在。');
      const inspectionResult = await client.query<{ id: string }>(
        `INSERT INTO floorwalk.inspections (site_id, template_id, inspector_id, status, score, submitted_at)
         VALUES ($1, $2, $3, $4, $5, now() - interval '12 hours')
         RETURNING id`,
        [
          siteId,
          templateId,
          inspectorId,
          status,
          status === 'rework' ? 88 : 63,
        ],
      );
      await insertInspectionItems(
        client,
        inspectionResult.rows[0].id,
        itemRows.rows,
        true,
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function insertInspectionItems(
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  inspectionId: string,
  items: readonly {
    position: number;
    title: string;
    photo_required: boolean;
    critical: boolean;
  }[],
  firstSiteHistory: boolean,
) {
  for (const item of items) {
    const result = firstSiteHistory && item.position === 8 ? 'fail' : 'pass';
    await client.query(
      `INSERT INTO floorwalk.inspection_items (inspection_id, position, title, photo_required, critical, result)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        inspectionId,
        item.position,
        item.title,
        item.photo_required,
        item.critical,
        result,
      ],
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  seedDatabase().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
