import argon2 from 'argon2';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import { createPool, getDatabaseUrl } from './client.js';

export const DEMO_PASSWORD = 'northbean-demo';
const templateItems = [
  ['门头灯箱', false, false],
  ['地面清洁', false, false],
  ['冷柜温度', true, false],
  ['食品效期', true, false],
  ['收银台整洁', false, false],
  ['物料陈列', false, false],
  ['员工着装', false, false],
  ['闭店记录', false, false],
] as const;

export async function seedDatabase(databaseUrl = getDatabaseUrl()) {
  const pool = createPool(databaseUrl);
  const client = await pool.connect();
  const storageDir = path.resolve(
    process.env.STORAGE_DIR ?? path.join('apps', 'api', '.storage'),
  );
  await mkdir(storageDir, { recursive: true });
  try {
    await client.query('BEGIN');
    await client.query(
      'TRUNCATE TABLE floorwalk.reviews, floorwalk.evidence, floorwalk.inspection_items, floorwalk.inspections, floorwalk.users, floorwalk.template_items, floorwalk.templates, floorwalk.sites RESTART IDENTITY CASCADE',
    );

    const sites = new Map<string, string>();
    for (let index = 1; index <= 12; index += 1) {
      const code = `NB-${String(index).padStart(3, '0')}`;
      const result = await client.query<{ id: string }>(
        `INSERT INTO floorwalk.sites (code, name)
         VALUES ($1, $2) RETURNING id`,
        [code, `Northbean Coffee ${index}`],
      );
      sites.set(code, result.rows[0].id);
    }

    const templateResult = await client.query<{ id: string }>(
      `INSERT INTO floorwalk.templates (name) VALUES ('开店检查') RETURNING id`,
    );
    const templateId = templateResult.rows[0].id;
    for (let index = 0; index < templateItems.length; index += 1) {
      const [title, photoRequired, critical] = templateItems[index];
      await client.query(
        `INSERT INTO floorwalk.template_items (template_id, position, title, photo_required, critical)
         VALUES ($1, $2, $3, $4, $5)`,
        [templateId, index + 1, title, photoRequired, critical],
      );
    }

    const passwordHash = await argon2.hash(DEMO_PASSWORD);
    const inspectors = new Map<string, string>();
    for (let index = 1; index <= 12; index += 1) {
      const code = `NB-${String(index).padStart(3, '0')}`;
      const email =
        index === 1
          ? 'inspector@northbean.example'
          : `inspector+nb-${String(index).padStart(3, '0')}@northbean.example`;
      const result = await client.query<{ id: string }>(
        `INSERT INTO floorwalk.users (email, password_hash, display_name, role, site_id)
         VALUES ($1, $2, $3, 'inspector', $4) RETURNING id`,
        [email, passwordHash, `Northbean ${code} 店员`, sites.get(code)],
      );
      inspectors.set(code, result.rows[0].id);
    }
    const supervisorResult = await client.query<{ id: string }>(
      `INSERT INTO floorwalk.users (email, password_hash, display_name, role, site_id)
       VALUES ('supervisor@northbean.example', $1, 'Northbean 主管', 'supervisor', NULL)
       RETURNING id`,
      [passwordHash],
    );
    await client.query(
      `INSERT INTO floorwalk.users (email, password_hash, display_name, role, site_id)
       VALUES ('hq@northbean.example', $1, 'Northbean 总部', 'hq', NULL)`,
      [passwordHash],
    );

    const itemRows = await client.query<{
      id: string;
      position: number;
      title: string;
      photo_required: boolean;
      critical: boolean;
    }>(
      'SELECT id, position, title, photo_required, critical FROM floorwalk.template_items WHERE template_id = $1 ORDER BY position',
      [templateId],
    );
    let sequence = 0;
    const nextTime = () => {
      const value = new Date(Date.UTC(2026, 0, 1, 0, sequence));
      sequence += 1;
      return value;
    };

    for (let index = 1; index <= 12; index += 1) {
      const code = `NB-${String(index).padStart(3, '0')}`;
      const siteId = sites.get(code);
      const inspectorId = inspectors.get(code);
      if (!siteId || !inspectorId) throw new Error(`门店 ${code} 创建失败。`);
      await insertInspection(
        client,
        storageDir,
        {
          siteId,
          templateId,
          inspectorId,
          status: index === 12 ? 'failed' : 'passed',
          score: null,
          createdAt: nextTime(),
          failPosition: index === 1 ? 8 : index === 12 ? 3 : null,
          reviewerId: supervisorResult.rows[0].id,
          reviewAction: index === 12 ? 'fail' : 'approve',
        },
        itemRows.rows,
      );
    }

    const extras = [
      { code: 'NB-012', status: 'failed' as const },
      { code: 'NB-012', status: 'failed' as const },
      { code: 'NB-002', status: 'rework' as const },
      { code: 'NB-003', status: 'rework' as const },
      { code: 'NB-004', status: 'submitted' as const },
      { code: 'NB-005', status: 'submitted' as const },
    ];
    for (const extra of extras) {
      const siteId = sites.get(extra.code);
      const inspectorId = inspectors.get(extra.code);
      if (!siteId || !inspectorId) throw new Error(`门店 ${extra.code} 创建失败。`);
      await insertInspection(
        client,
        storageDir,
        {
          siteId,
          templateId,
          inspectorId,
          status: extra.status,
          score: null,
          createdAt: nextTime(),
          failPosition: extra.status === 'submitted' ? null : 3,
          reviewerId:
            extra.status === 'submitted' ? null : supervisorResult.rows[0].id,
          reviewAction:
            extra.status === 'failed'
              ? 'fail'
              : extra.status === 'rework'
                ? 'rework'
                : null,
        },
        itemRows.rows,
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

async function insertInspection(
  client: PoolClient,
  storageDir: string,
  input: {
    siteId: string;
    templateId: string;
    inspectorId: string;
    status: 'failed' | 'rework' | 'submitted' | 'passed';
    score: number | null;
    createdAt: Date;
    failPosition: number | null;
    reviewerId: string | null;
    reviewAction: 'approve' | 'fail' | 'rework' | null;
  },
  items: readonly {
    id: string;
    position: number;
    title: string;
    photo_required: boolean;
    critical: boolean;
  }[],
) {
  const submittedAt = new Date(input.createdAt.getTime() + 60 * 60 * 1000);
  const decidedAt =
    input.status === 'submitted'
      ? null
      : new Date(input.createdAt.getTime() + 2 * 60 * 60 * 1000);
  const inspectionResult = await client.query<{ id: string }>(
    `INSERT INTO floorwalk.inspections
      (site_id, template_id, inspector_id, status, score, submitted_at, decided_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      input.siteId,
      input.templateId,
      input.inspectorId,
      input.status,
      input.score,
      submittedAt,
      decidedAt,
      input.createdAt,
    ],
  );
  const inspectionId = inspectionResult.rows[0].id;
  const reworkItemIds: string[] = [];
  let passedItems = 0;
  for (const item of items) {
    const result = input.failPosition === item.position ? 'fail' : 'pass';
    if (result === 'pass') passedItems += 1;
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO floorwalk.inspection_items
        (inspection_id, position, title, photo_required, critical, result, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        inspectionId,
        item.position,
        item.title,
        item.photo_required,
        item.critical,
        result,
        input.createdAt,
      ],
    );
    if (input.status === 'rework' && result === 'fail')
      reworkItemIds.push(inserted.rows[0].id);
    if (item.photo_required) {
      const storageKey = `seed/${inspectionId}/${inserted.rows[0].id}.jpg`;
      const target = path.resolve(storageDir, storageKey);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, Buffer.from('floorwalk-seed-photo'));
      await client.query(
        `INSERT INTO floorwalk.evidence
          (inspection_item_id, storage_key, mime, size, created_at)
         VALUES ($1, $2, 'image/jpeg', $3, $4)`,
        [
          inserted.rows[0].id,
          storageKey,
          Buffer.byteLength('floorwalk-seed-photo'),
          input.createdAt,
        ],
      );
    }
  }
  const score = Math.floor((passedItems / items.length) * 100 + 0.5);
  await client.query('UPDATE floorwalk.inspections SET score = $1 WHERE id = $2', [
    score,
    inspectionId,
  ]);
  if (input.reviewAction && input.reviewerId) {
    await client.query(
      `INSERT INTO floorwalk.reviews
        (inspection_id, reviewer_id, action, rework_item_ids, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        inspectionId,
        input.reviewerId,
        input.reviewAction,
        input.reviewAction === 'rework' ? reworkItemIds : null,
        decidedAt ?? input.createdAt,
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
