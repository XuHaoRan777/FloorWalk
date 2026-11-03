import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import { LocalStorageDriver } from '../storage/local.js';
import type { StorageDriver } from '../storage/types.js';
import { createPool, getDatabaseUrl } from './client.js';

export const DEMO_PASSWORD = 'northbean-demo';
const seedPhoto = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9oADAMBAAIAAwAAABAf/9k=',
  'base64',
);
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
const seedItems = templateItems.map(
  ([title, photoRequired, critical], index) => ({
    position: index + 1,
    title,
    photo_required: photoRequired,
    critical,
  }),
);

export async function seedDatabase(
  databaseUrl = getDatabaseUrl(),
  storagePath = process.env.STORAGE_DIR ?? path.join('apps', 'api', '.storage'),
) {
  const pool = createPool(databaseUrl);
  const client = await pool.connect();
  const storage = new LocalStorageDriver(path.resolve(storagePath));
  const writtenKeys: string[] = [];
  let previousKeys: string[];
  try {
    await client.query('BEGIN');
    const previousFiles = await client.query<{ storage_key: string }>(
      `SELECT e.storage_key FROM floorwalk.evidence e
       JOIN floorwalk.inspection_items ii ON ii.id = e.inspection_item_id
       JOIN floorwalk.inspections i ON i.id = ii.inspection_id
       JOIN floorwalk.sites s ON s.id = i.site_id
       JOIN floorwalk.organizations o ON o.id = s.org_id
       WHERE o.name IN ('Northbean', '演示二号')
       UNION
       SELECT m.storage_key FROM floorwalk.chat_messages m
       JOIN floorwalk.inspections i ON i.id = m.inspection_id
       JOIN floorwalk.sites s ON s.id = i.site_id
       JOIN floorwalk.organizations o ON o.id = s.org_id
       WHERE o.name IN ('Northbean', '演示二号') AND m.storage_key IS NOT NULL`,
    );
    previousKeys = previousFiles.rows.map((row) => row.storage_key);
    await client.query(
      'TRUNCATE TABLE floorwalk.chat_messages, floorwalk.sessions, floorwalk.reviews, floorwalk.evidence, floorwalk.inspection_items, floorwalk.inspections, floorwalk.site_supervisors, floorwalk.users, floorwalk.template_items, floorwalk.templates, floorwalk.sites, floorwalk.organizations RESTART IDENTITY CASCADE',
    );
    const orgResult = await client.query<{ id: string }>(
      `INSERT INTO floorwalk.organizations (name) VALUES ('Northbean') RETURNING id`,
    );
    const orgId = orgResult.rows[0].id;

    const sites = new Map<string, string>();
    for (let index = 1; index <= 12; index += 1) {
      const code = `NB-${String(index).padStart(3, '0')}`;
      const result = await client.query<{ id: string }>(
        `INSERT INTO floorwalk.sites (org_id, code, name)
         VALUES ($1, $2, $3) RETURNING id`,
        [orgId, code, `Northbean Coffee ${index}`],
      );
      sites.set(code, result.rows[0].id);
    }

    const templateId = await insertTemplate(client, orgId, true);

    const passwordHash = await argon2.hash(DEMO_PASSWORD);
    const inspectors = new Map<string, string>();
    for (let index = 1; index <= 12; index += 1) {
      const code = `NB-${String(index).padStart(3, '0')}`;
      const email =
        index === 1
          ? 'inspector@northbean.example'
          : `inspector+nb-${String(index).padStart(3, '0')}@northbean.example`;
      const result = await client.query<{ id: string }>(
        `INSERT INTO floorwalk.users (org_id, email, password_hash, display_name, role, site_id)
         VALUES ($1, $2, $3, $4, 'inspector', $5) RETURNING id`,
        [orgId, email, passwordHash, `Northbean ${code} 店员`, sites.get(code)],
      );
      inspectors.set(code, result.rows[0].id);
    }
    const supervisorResult = await client.query<{ id: string }>(
      `INSERT INTO floorwalk.users (org_id, email, password_hash, display_name, role, site_id)
       VALUES ($1, 'supervisor@northbean.example', $2, 'Northbean 主管', 'supervisor', NULL)
       RETURNING id`,
      [orgId, passwordHash],
    );
    const secondSupervisorResult = await client.query<{ id: string }>(
      `INSERT INTO floorwalk.users (org_id, email, password_hash, display_name, role, site_id)
       VALUES ($1, 'supervisor+2@northbean.example', $2, 'Northbean 主管二', 'supervisor', NULL)
       RETURNING id`,
      [orgId, passwordHash],
    );
    await client.query(
      `INSERT INTO floorwalk.users (org_id, email, password_hash, display_name, role, site_id)
       VALUES ($1, 'hq@northbean.example', $2, 'Northbean 商家管理员', 'admin', NULL)`,
      [orgId, passwordHash],
    );
    const supervisorBySite = new Map<string, string>();
    for (const [code, siteId] of sites) {
      const supervisorId =
        Number(code.slice(3)) <= 6
          ? supervisorResult.rows[0].id
          : secondSupervisorResult.rows[0].id;
      supervisorBySite.set(code, supervisorId);
      await client.query(
        'INSERT INTO floorwalk.site_supervisors (site_id, user_id) VALUES ($1, $2)',
        [siteId, supervisorId],
      );
    }

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
      await insertInspection(client, storage, writtenKeys, {
        orgId,
        siteId,
        templateId,
        inspectorId,
        status: index === 12 ? 'failed' : 'passed',
        createdAt: nextTime(),
        failPosition: index === 1 ? 8 : index === 12 ? 3 : null,
        reviewerId: supervisorBySite.get(code) ?? null,
        reviewAction: index === 12 ? 'fail' : 'approve',
      });
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
      if (!siteId || !inspectorId)
        throw new Error(`门店 ${extra.code} 创建失败。`);
      await insertInspection(client, storage, writtenKeys, {
        orgId,
        siteId,
        templateId,
        inspectorId,
        status: extra.status,
        createdAt: nextTime(),
        failPosition: extra.status === 'submitted' ? null : 3,
        reviewerId:
          extra.status === 'submitted'
            ? null
            : (supervisorBySite.get(extra.code) ?? null),
        reviewAction:
          extra.status === 'failed'
            ? 'fail'
            : extra.status === 'rework'
              ? 'rework'
              : null,
      });
    }

    const reworkInspection = await client.query<{
      id: string;
      inspector_id: string;
    }>(
      `SELECT i.id, i.inspector_id
       FROM floorwalk.inspections i
       JOIN floorwalk.sites s ON s.id = i.site_id
       WHERE s.org_id = $1 AND s.code = 'NB-002' AND i.status = 'rework'
       ORDER BY i.created_at DESC LIMIT 1`,
      [orgId],
    );
    const supervisorId = supervisorResult.rows[0].id;
    const inspection = reworkInspection.rows[0];
    if (!inspection) throw new Error('NB-002 打回演示单创建失败。');
    await client.query(
      `INSERT INTO floorwalk.chat_messages
        (inspection_id, author_id, body, created_at)
       VALUES ($1, $2, $3, now())`,
      [inspection.id, supervisorId, '请补充冷柜温度照片后重新提交。'],
    );
    const imageKey = `org/${orgId}/chat/${inspection.id}/${randomUUID()}.jpg`;
    writtenKeys.push(imageKey);
    await storage.put(imageKey, seedPhoto, 'image/jpeg');
    await client.query(
      `INSERT INTO floorwalk.chat_messages
        (inspection_id, author_id, storage_key, mime, size, created_at)
       VALUES ($1, $2, $3, 'image/jpeg', $4, now() + interval '1 second')`,
      [inspection.id, inspection.inspector_id, imageKey, seedPhoto.byteLength],
    );

    const secondOrgResult = await client.query<{ id: string }>(
      `INSERT INTO floorwalk.organizations (name) VALUES ('演示二号') RETURNING id`,
    );
    const secondOrgId = secondOrgResult.rows[0].id;
    const secondSiteResult = await client.query<{ id: string }>(
      `INSERT INTO floorwalk.sites (org_id, code, name)
       VALUES ($1, 'DEMO2-001', '演示二号门店') RETURNING id`,
      [secondOrgId],
    );
    const secondSiteId = secondSiteResult.rows[0].id;
    const secondOrgUsers = new Map<string, string>();
    for (const [role, displayName] of [
      ['inspector', '演示二号店员'],
      ['supervisor', '演示二号主管'],
      ['admin', '演示二号管理员'],
    ] as const) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO floorwalk.users (org_id, email, password_hash, display_name, role, site_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          secondOrgId,
          `${role}@demo2.example`,
          passwordHash,
          displayName,
          role,
          role === 'inspector' ? secondSiteId : null,
        ],
      );
      secondOrgUsers.set(role, result.rows[0].id);
    }
    await client.query(
      'INSERT INTO floorwalk.site_supervisors (site_id, user_id) VALUES ($1, $2)',
      [secondSiteId, secondOrgUsers.get('supervisor')],
    );
    const secondTemplateId = await insertTemplate(client, secondOrgId, false);
    const secondInspectorId = secondOrgUsers.get('inspector');
    const secondReviewerId = secondOrgUsers.get('supervisor');
    if (!secondInspectorId || !secondReviewerId)
      throw new Error('演示二号账号创建失败。');
    await insertInspection(client, storage, writtenKeys, {
      orgId: secondOrgId,
      siteId: secondSiteId,
      templateId: secondTemplateId,
      inspectorId: secondInspectorId,
      status: 'passed',
      createdAt: nextTime(),
      failPosition: null,
      reviewerId: secondReviewerId,
      reviewAction: 'approve',
    });

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    await Promise.all(writtenKeys.map((key) => storage.delete(key)));
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
  await Promise.all(previousKeys.map((key) => storage.delete(key)));
}

async function insertTemplate(
  client: PoolClient,
  orgId: string,
  isCurrent: boolean,
) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO floorwalk.templates (org_id, name, is_current)
     VALUES ($1, '开店检查', $2) RETURNING id`,
    [orgId, isCurrent],
  );
  const id = result.rows[0].id;
  for (const item of seedItems) {
    await client.query(
      `INSERT INTO floorwalk.template_items (template_id, position, title, photo_required, critical)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, item.position, item.title, item.photo_required, item.critical],
    );
  }
  return id;
}

async function insertInspection(
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
    reviewAction: 'approve' | 'fail' | 'rework' | null;
  },
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
      null,
      submittedAt,
      decidedAt,
      input.createdAt,
    ],
  );
  const inspectionId = inspectionResult.rows[0].id;
  const reworkItemIds: string[] = [];
  let passedItems = 0;
  for (const item of seedItems) {
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
