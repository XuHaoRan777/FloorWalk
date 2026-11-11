import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStorageDriver } from '../storage/index.js';
import { createPool, getDatabaseUrl } from './client.js';
import { seedHistoricalInspection } from './seed-inspection.js';
import { seedPhoto } from './seed-data.js';
import { seedTemplate } from './seed-template.js';

export const DEMO_PASSWORD = 'northbean-demo';
export async function seedDatabase(
  databaseUrl = getDatabaseUrl(),
  storagePath = process.env.STORAGE_DIR ?? path.join('apps', 'api', '.storage'),
) {
  const storage = await getStorageDriver(path.resolve(storagePath));
  const pool = createPool(databaseUrl);
  const client = await pool.connect();
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
      'TRUNCATE TABLE floorwalk.chat_messages, floorwalk.sessions, floorwalk.reviews, floorwalk.inspection_item_decisions, floorwalk.evidence, floorwalk.inspection_participants, floorwalk.inspection_items, floorwalk.inspections, floorwalk.inspection_tasks, floorwalk.users, floorwalk.template_items, floorwalk.templates, floorwalk.ai_review_standards, floorwalk.sites, floorwalk.organizations RESTART IDENTITY CASCADE',
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

    const templateId = await seedTemplate(client, orgId);

    const passwordHash = await argon2.hash(DEMO_PASSWORD);
    const inspectors = new Map<string, string>();
    for (let index = 1; index <= 12; index += 1) {
      const code = `NB-${String(index).padStart(3, '0')}`;
      const email =
        index === 1
          ? 'inspector@northbean.example'
          : `inspector+nb-${String(index).padStart(3, '0')}@northbean.example`;
      const result = await client.query<{ id: string }>(
        `INSERT INTO floorwalk.users (org_id, login_name, password_hash, display_name, role, site_id)
         VALUES ($1, $2, $3, $4, 'store_manager', $5) RETURNING id`,
        [orgId, email, passwordHash, `Northbean ${code} 店长`, sites.get(code)],
      );
      inspectors.set(code, result.rows[0].id);
    }
    const adminResult = await client.query<{ id: string }>(
      `INSERT INTO floorwalk.users (org_id, login_name, password_hash, display_name, role, site_id)
       VALUES ($1, 'hq@northbean.example', $2, 'Northbean 商家管理员', 'admin', NULL) RETURNING id`,
      [orgId, passwordHash],
    );
    await client.query(
      `INSERT INTO floorwalk.users (org_id, login_name, password_hash, display_name, role, site_id)
       VALUES ($1, 'manager2@northbean.example', $2, 'Northbean NB-001 店长二', 'store_manager', $3)`,
      [orgId, passwordHash, sites.get('NB-001')],
    );

    let sequence = 0;
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const nextTime = (today = false) => {
      const dayOffset = today ? 6 : sequence % 7;
      const minuteOffset = sequence * 3;
      const value = new Date(
        todayUtc.getTime() -
          (6 - dayOffset) * 24 * 60 * 60 * 1000 +
          9 * 60 * 60 * 1000 +
          minuteOffset * 60 * 1000,
      );
      sequence += 1;
      return value;
    };

    for (let index = 1; index <= 12; index += 1) {
      const code = `NB-${String(index).padStart(3, '0')}`;
      const siteId = sites.get(code);
      const inspectorId = inspectors.get(code);
      if (!siteId || !inspectorId) throw new Error(`门店 ${code} 创建失败。`);
      await seedHistoricalInspection(client, storage, writtenKeys, {
        orgId,
        siteId,
        templateId,
        inspectorId,
        status: index === 12 ? 'failed' : 'passed',
        createdAt: nextTime(),
        failPosition: index === 1 ? 8 : index === 12 ? 3 : null,
        reviewerId: adminResult.rows[0].id,
      });
    }

    const extras = [
      { code: 'NB-012', status: 'failed' as const },
      { code: 'NB-012', status: 'failed' as const },
      { code: 'NB-002', status: 'rework' as const },
      { code: 'NB-003', status: 'rework' as const },
      { code: 'NB-004', status: 'passed' as const },
      { code: 'NB-005', status: 'passed' as const },
    ];
    for (const extra of extras) {
      const siteId = sites.get(extra.code);
      const inspectorId = inspectors.get(extra.code);
      if (!siteId || !inspectorId)
        throw new Error(`门店 ${extra.code} 创建失败。`);
      await seedHistoricalInspection(client, storage, writtenKeys, {
        orgId,
        siteId,
        templateId,
        inspectorId,
        status: extra.status,
        createdAt: nextTime(extra.status === 'rework'),
        failPosition: extra.status === 'rework' ? 3 : null,
        reviewerId: adminResult.rows[0].id,
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
    const supervisorId = adminResult.rows[0].id;
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
      ['store_manager', '演示二号店长'],
      ['admin', '演示二号管理员'],
    ] as const) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO floorwalk.users (org_id, login_name, password_hash, display_name, role, site_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          secondOrgId,
          role === 'store_manager'
            ? 'inspector@northbean.example'
            : 'admin@demo2.example',
          passwordHash,
          displayName,
          role,
          role === 'store_manager' ? secondSiteId : null,
        ],
      );
      secondOrgUsers.set(role, result.rows[0].id);
    }
    const secondTemplateId = await seedTemplate(client, secondOrgId);
    const secondInspectorId = secondOrgUsers.get('store_manager');
    const secondReviewerId = secondOrgUsers.get('admin');
    if (!secondInspectorId || !secondReviewerId)
      throw new Error('演示二号账号创建失败。');
    await seedHistoricalInspection(client, storage, writtenKeys, {
      orgId: secondOrgId,
      siteId: secondSiteId,
      templateId: secondTemplateId,
      inspectorId: secondInspectorId,
      status: 'passed',
      createdAt: nextTime(),
      failPosition: null,
      reviewerId: secondReviewerId,
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  seedDatabase().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
