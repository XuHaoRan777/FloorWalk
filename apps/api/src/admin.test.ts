import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import sharp from 'sharp';
import {
  loginResponseSchema,
  inspectorRecordsResponseSchema,
  siteResponseSchema,
  templateResponseSchema,
  todayResponseSchema,
} from '@libs/shared';
import { AppModule } from './app.module.js';
import { createPool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';
import { HttpErrorFilter } from './http-exception.filter.js';
import { getStorageDriver } from './storage/index.js';

describe('admin API', () => {
  let app: NestExpressApplication;
  let inspectorCookie: string;
  let hqCookie: string;
  let initialTemplateId: string;
  const testCodePrefix = `FW013-${randomUUID()}`;
  const createdTemplateIds: string[] = [];
  const createdInspectionIds: string[] = [];
  const createdEvidenceKeys: string[] = [];

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
    const initialPool = createPool();
    try {
      const current = await initialPool.query<{ id: string }>(
        "SELECT t.id FROM floorwalk.templates t JOIN floorwalk.organizations o ON o.id = t.org_id WHERE o.name = 'Northbean' AND t.name = '开店检查'",
      );
      initialTemplateId = current.rows[0].id;
    } finally {
      await initialPool.end();
    }

    const login = async (loginName: string) => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/session')
        .send({ loginName, password: 'northbean-demo' })
        .expect(201);
      loginResponseSchema.parse(response.body);
      return (response.headers['set-cookie'] as unknown as string[])[0].split(
        ';',
      )[0];
    };
    inspectorCookie = await login('manager2@northbean.example');
    hqCookie = await login('hq@northbean.example');
  }, 60000);

  afterAll(async () => {
    const pool = createPool();
    try {
      if (createdInspectionIds.length) {
        await pool.query(
          'DELETE FROM floorwalk.chat_messages WHERE inspection_id = ANY($1::uuid[])',
          [createdInspectionIds],
        );
        await pool.query(
          `DELETE FROM floorwalk.evidence WHERE inspection_item_id IN
           (SELECT id FROM floorwalk.inspection_items WHERE inspection_id = ANY($1::uuid[]))`,
          [createdInspectionIds],
        );
        await pool.query(
          'DELETE FROM floorwalk.inspection_items WHERE inspection_id = ANY($1::uuid[])',
          [createdInspectionIds],
        );
        await pool.query(
          'DELETE FROM floorwalk.reviews WHERE inspection_id = ANY($1::uuid[])',
          [createdInspectionIds],
        );
        await pool.query(
          'DELETE FROM floorwalk.inspections WHERE id = ANY($1::uuid[])',
          [createdInspectionIds],
        );
      }
      if (createdTemplateIds.length) {
        await pool.query(
          'DELETE FROM floorwalk.template_items WHERE template_id = ANY($1::uuid[])',
          [createdTemplateIds],
        );
        await pool.query(
          'DELETE FROM floorwalk.templates WHERE id = ANY($1::uuid[])',
          [createdTemplateIds],
        );
      }
      await pool.query('DELETE FROM floorwalk.sites WHERE code LIKE $1', [
        `${testCodePrefix}%`,
      ]);
      await pool.query('DELETE FROM floorwalk.sessions');
      await pool.query(
        `UPDATE floorwalk.sites SET deactivated_at = NULL WHERE code = 'NB-001'`,
      );
    } finally {
      await pool.end();
      await app.close();
      const storage = await getStorageDriver();
      await Promise.all(createdEvidenceKeys.map((key) => storage.delete(key)));
    }
  });

  it('persists site creation, rename, deactivation, and reactivation', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/admin/sites')
      .set('Cookie', hqCookie)
      .send({ code: `${testCodePrefix}-A`, name: '新门店' })
      .expect(201);
    const site = siteResponseSchema.parse(created.body);
    expect(site.active).toBe(true);

    const renamed = await request(app.getHttpServer())
      .patch(`/api/admin/sites/${site.id}`)
      .set('Cookie', hqCookie)
      .send({ name: '新门店改名' })
      .expect(200);
    expect(siteResponseSchema.parse(renamed.body).name).toBe('新门店改名');

    const deactivated = await request(app.getHttpServer())
      .patch(`/api/admin/sites/${site.id}`)
      .set('Cookie', hqCookie)
      .send({ active: false })
      .expect(200);
    expect(siteResponseSchema.parse(deactivated.body).active).toBe(false);

    const reactivated = await request(app.getHttpServer())
      .patch(`/api/admin/sites/${site.id}`)
      .set('Cookie', hqCookie)
      .send({ active: true })
      .expect(200);
    expect(siteResponseSchema.parse(reactivated.body).active).toBe(true);

    const pool = createPool();
    try {
      const persisted = await pool.query<{
        code: string;
        name: string;
        deactivated_at: Date | null;
      }>(
        'SELECT code, name, deactivated_at FROM floorwalk.sites WHERE id = $1',
        [site.id],
      );
      expect(persisted.rows[0]).toEqual({
        code: `${testCodePrefix}-A`,
        name: '新门店改名',
        deactivated_at: null,
      });
    } finally {
      await pool.end();
    }
  });

  it('allows administrator and rejects store manager access to every site endpoint', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/sites')
      .set('Cookie', hqCookie)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/admin/sites')
      .set('Cookie', hqCookie)
      .send({ code: `${testCodePrefix}-${randomUUID()}`, name: '权限门店' })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/admin/sites')
      .set('Cookie', inspectorCookie)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/admin/sites')
      .set('Cookie', inspectorCookie)
      .send({ code: `${testCodePrefix}-DENIED`, name: '越权门店' })
      .expect(403);
    const created = await request(app.getHttpServer())
      .post('/api/admin/sites')
      .set('Cookie', hqCookie)
      .send({ code: `${testCodePrefix}-UPDATE-DENIED`, name: '权限门店' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/admin/sites/${created.body.id}`)
      .set('Cookie', inspectorCookie)
      .send({ name: '不可修改' })
      .expect(403);
  });

  it('returns 400 for invalid input, 409 for duplicate codes, and 404 for missing sites', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/sites')
      .set('Cookie', hqCookie)
      .send({ code: '', name: '无效门店' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/admin/sites')
      .set('Cookie', hqCookie)
      .send({ code: `${testCodePrefix}-DUP`, name: '重复门店' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/admin/sites')
      .set('Cookie', hqCookie)
      .send({ code: `${testCodePrefix}-DUP`, name: '重复门店二' })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/api/admin/sites/${randomUUID()}`)
      .set('Cookie', hqCookie)
      .send({ name: '不存在' })
      .expect(404);
    await request(app.getHttpServer())
      .patch('/api/admin/sites/not-a-uuid')
      .set('Cookie', hqCookie)
      .send({ name: '无效 ID' })
      .expect(400);
  });

  it('selects any tenant template, enforces photos and notes, and keeps snapshots unchanged', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', hqCookie)
      .send({
        name: `${testCodePrefix} 模板`,
        aiEnabled: false,
        items: [
          {
            title: '初始一',
            minPhotoCount: 0,
            acceptanceCriteria: '填写现场整洁情况',
            critical: false,
          },
          {
            title: '初始二',
            minPhotoCount: 2,
            acceptanceCriteria: '拍摄正面和侧面',
            critical: true,
          },
        ],
      })
      .expect(201);
    const template = templateResponseSchema.parse(created.body);
    createdTemplateIds.push(template.id);
    expect(template.items.map((item) => item.position)).toEqual([1, 2]);
    const today = await request(app.getHttpServer())
      .get('/api/inspector/today')
      .set('Cookie', inspectorCookie)
      .expect(200);
    const available = todayResponseSchema.parse(today.body).templates;
    expect(available.map((value) => value.id)).toEqual(
      expect.arrayContaining([initialTemplateId, template.id]),
    );
    const foreignPool = createPool();
    try {
      const foreignTemplateId = (
        await foreignPool.query(
          "SELECT t.id FROM floorwalk.templates t JOIN floorwalk.organizations o ON o.id = t.org_id WHERE o.name = '演示二号'",
        )
      ).rows[0].id;
      expect(available.some((value) => value.id === foreignTemplateId)).toBe(
        false,
      );
      await request(app.getHttpServer())
        .post('/api/inspections')
        .set('Cookie', inspectorCookie)
        .send({ templateId: foreignTemplateId })
        .expect(404);
    } finally {
      await foreignPool.end();
    }

    const createdInspection = await request(app.getHttpServer())
      .post('/api/inspections')
      .set('Cookie', inspectorCookie)
      .send({ templateId: template.id })
      .expect(201);
    createdInspectionIds.push(createdInspection.body.id);
    const initialItems = await request(app.getHttpServer())
      .get(`/api/inspections/${createdInspection.body.id}`)
      .set('Cookie', inspectorCookie)
      .expect(200);
    for (const item of initialItems.body.items)
      await request(app.getHttpServer())
        .patch(`/api/inspections/${createdInspection.body.id}/items/${item.id}`)
        .set('Cookie', inspectorCookie)
        .send({ result: 'pass', note: '   ' })
        .expect(200);
    const photoItem = initialItems.body.items[1];
    const photo = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#ffffff' },
    })
      .jpeg()
      .toBuffer();
    const upload = async () => {
      const response = await request(app.getHttpServer())
        .post(
          `/api/inspections/${createdInspection.body.id}/items/${photoItem.id}/evidence`,
        )
        .set('Cookie', inspectorCookie)
        .attach('file', photo, {
          filename: 'fw026.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);
      createdEvidenceKeys.push(response.body.storageKey);
    };
    await upload();
    await request(app.getHttpServer())
      .post(`/api/inspections/${createdInspection.body.id}/submit`)
      .set('Cookie', inspectorCookie)
      .expect(422);
    await request(app.getHttpServer())
      .patch(
        `/api/inspections/${createdInspection.body.id}/items/${initialItems.body.items[0].id}`,
      )
      .set('Cookie', inspectorCookie)
      .send({ result: 'pass', note: '现场已检查' })
      .expect(200);
    // A valid note still cannot compensate for one missing photo.
    await request(app.getHttpServer())
      .post(`/api/inspections/${createdInspection.body.id}/submit`)
      .set('Cookie', inspectorCookie)
      .expect(422);
    await upload();
    await request(app.getHttpServer())
      .patch(
        `/api/inspections/${createdInspection.body.id}/items/${initialItems.body.items[0].id}`,
      )
      .set('Cookie', inspectorCookie)
      .send({ result: 'pass', note: '' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/inspections/${createdInspection.body.id}/submit`)
      .set('Cookie', inspectorCookie)
      .expect(422);
    await request(app.getHttpServer())
      .patch(
        `/api/inspections/${createdInspection.body.id}/items/${initialItems.body.items[0].id}`,
      )
      .set('Cookie', inspectorCookie)
      .send({ result: 'pass', note: '现场已检查' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/inspections/${createdInspection.body.id}/submit`)
      .set('Cookie', inspectorCookie)
      .expect(201);

    const readInspectionSnapshot = async (inspectionId: string) => {
      const pool = createPool();
      try {
        const result = await pool.query(
          `SELECT i.status, i.score, ii.position, ii.title, ii.min_photo_count, ii.acceptance_criteria,
             ii.critical, ii.result
           FROM floorwalk.inspections i
           JOIN floorwalk.inspection_items ii ON ii.inspection_id = i.id
           WHERE i.id = $1 ORDER BY ii.position`,
          [inspectionId],
        );
        return result.rows;
      } finally {
        await pool.end();
      }
    };
    const before = await readInspectionSnapshot(createdInspection.body.id);
    expect(before).toEqual([
      expect.objectContaining({
        min_photo_count: 0,
        acceptance_criteria: '填写现场整洁情况',
        critical: false,
      }),
      expect.objectContaining({
        min_photo_count: 2,
        acceptance_criteria: '拍摄正面和侧面',
        critical: true,
      }),
    ]);
    const updated = await request(app.getHttpServer())
      .put(`/api/admin/templates/${template.id}`)
      .set('Cookie', hqCookie)
      .send({
        name: `${testCodePrefix} 模板新版`,
        aiEnabled: false,
        items: [
          {
            position: 1,
            title: '新版一',
            minPhotoCount: 0,
            acceptanceCriteria: '',
            critical: true,
          },
          {
            position: 2,
            title: '新版二',
            minPhotoCount: 1,
            acceptanceCriteria: '',
            critical: false,
          },
          {
            position: 3,
            title: '新版三',
            minPhotoCount: 0,
            acceptanceCriteria: '',
            critical: false,
          },
        ],
      })
      .expect(200);
    expect(templateResponseSchema.parse(updated.body).items).toHaveLength(3);
    expect(await readInspectionSnapshot(createdInspection.body.id)).toEqual(
      before,
    );

    const nextInspection = await request(app.getHttpServer())
      .post('/api/inspections')
      .set('Cookie', inspectorCookie)
      .send({ templateId: template.id })
      .expect(201);
    createdInspectionIds.push(nextInspection.body.id);
    const copiedItems = await request(app.getHttpServer())
      .get(`/api/inspections/${nextInspection.body.id}`)
      .set('Cookie', inspectorCookie)
      .expect(200);
    expect(
      copiedItems.body.items.map((item: { title: string }) => item.title),
    ).toEqual(['新版一', '新版二', '新版三']);
  });

  it('allows administrator template access and rejects inspector requests', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/templates')
      .set('Cookie', hqCookie)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/admin/templates')
      .set('Cookie', inspectorCookie)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', inspectorCookie)
      .send({
        name: `${testCodePrefix} 越权模板`,
        aiEnabled: false,
        items: [
          {
            title: '项',
            minPhotoCount: 0,
            acceptanceCriteria: '',
            critical: false,
          },
        ],
      })
      .expect(403);
    const template = await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', hqCookie)
      .send({
        name: `${testCodePrefix} 权限模板`,
        aiEnabled: false,
        items: [
          {
            title: '项',
            minPhotoCount: 0,
            acceptanceCriteria: '',
            critical: false,
          },
        ],
      })
      .expect(201);
    createdTemplateIds.push(template.body.id);
    await request(app.getHttpServer())
      .put(`/api/admin/templates/${template.body.id}`)
      .set('Cookie', inspectorCookie)
      .send({
        name: `${testCodePrefix} 权限模板修改`,
        aiEnabled: false,
        items: [
          {
            position: 1,
            title: '项修改',
            minPhotoCount: 0,
            acceptanceCriteria: '',
            critical: false,
          },
        ],
      })
      .expect(403);
  });

  it('validates template items, duplicate names, and missing templates', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', hqCookie)
      .send({ name: `${testCodePrefix} 空模板`, items: [] })
      .expect(400);

    const created = await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', hqCookie)
      .send({
        name: `${testCodePrefix} 冲突模板`,
        aiEnabled: false,
        items: [
          {
            title: '项',
            minPhotoCount: 0,
            acceptanceCriteria: '',
            critical: false,
          },
        ],
      })
      .expect(201);
    createdTemplateIds.push(created.body.id);
    await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', hqCookie)
      .send({
        name: `${testCodePrefix} 冲突模板`,
        aiEnabled: false,
        items: [
          {
            title: '项二',
            minPhotoCount: 0,
            acceptanceCriteria: '',
            critical: false,
          },
        ],
      })
      .expect(409);
    const otherTemplate = await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', hqCookie)
      .send({
        name: `${testCodePrefix} 另一模板`,
        aiEnabled: false,
        items: [
          {
            title: '另一项',
            minPhotoCount: 0,
            acceptanceCriteria: '',
            critical: false,
          },
        ],
      })
      .expect(201);
    createdTemplateIds.push(otherTemplate.body.id);
    await request(app.getHttpServer())
      .put(`/api/admin/templates/${created.body.id}`)
      .set('Cookie', hqCookie)
      .send({
        name: `${testCodePrefix} 另一模板`,
        aiEnabled: false,
        items: [
          {
            position: 1,
            title: '不应替换',
            minPhotoCount: 0,
            acceptanceCriteria: '',
            critical: false,
          },
        ],
      })
      .expect(409);
    const retained = await request(app.getHttpServer())
      .get('/api/admin/templates')
      .set('Cookie', hqCookie)
      .expect(200);
    expect(
      retained.body.find((item: { id: string }) => item.id === created.body.id)
        .name,
    ).toBe(`${testCodePrefix} 冲突模板`);
    await request(app.getHttpServer())
      .put(`/api/admin/templates/${created.body.id}`)
      .set('Cookie', hqCookie)
      .send({
        name: `${testCodePrefix} 冲突模板`,
        aiEnabled: false,
        items: [
          {
            position: 2,
            title: '断序',
            minPhotoCount: 0,
            acceptanceCriteria: '',
            critical: false,
          },
        ],
      })
      .expect(400);
    await request(app.getHttpServer())
      .put(`/api/admin/templates/${created.body.id}`)
      .set('Cookie', hqCookie)
      .send({
        name: `${testCodePrefix} 冲突模板`,
        aiEnabled: false,
        items: [
          {
            position: 1,
            title: '项',
            minPhotoCount: 0,
            acceptanceCriteria: '',
            critical: false,
          },
        ],
      })
      .expect(200);
    await request(app.getHttpServer())
      .put(`/api/admin/templates/${randomUUID()}`)
      .set('Cookie', hqCookie)
      .send({
        name: `${testCodePrefix} 不存在`,
        aiEnabled: false,
        items: [
          {
            position: 1,
            title: '项',
            minPhotoCount: 0,
            acceptanceCriteria: '',
            critical: false,
          },
        ],
      })
      .expect(404);
  });

  it('waits for an in-flight deactivation before deciding whether creation is allowed', async () => {
    const pool = createPool();
    const client = await pool.connect();
    let pending: Promise<request.Response> | undefined;
    try {
      const site = await client.query<{ id: string }>(
        "SELECT id FROM floorwalk.sites WHERE code = 'NB-001'",
      );
      await client.query('BEGIN');
      await client.query(
        'UPDATE floorwalk.sites SET deactivated_at = now() WHERE id = $1',
        [site.rows[0].id],
      );
      const blocker = await client.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      pending = request(app.getHttpServer())
        .post('/api/inspections')
        .set('Cookie', inspectorCookie)
        .send({ templateId: initialTemplateId })
        .then((response) => {
          if (response.status === 201)
            createdInspectionIds.push(response.body.id);
          return response;
        });
      await expect
        .poll(async () => {
          const waiting = await pool.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM pg_stat_activity
           WHERE datname = current_database()
             AND $1 = ANY(pg_blocking_pids(pid))
             AND query LIKE '%FROM floorwalk.sites%FOR UPDATE%'`,
            [blocker.rows[0].pid],
          );
          return Number(waiting.rows[0].count);
        })
        .toBe(1);
      await client.query('COMMIT');
      expect((await pending).status).toBe(409);
    } finally {
      await client.query('ROLLBACK');
      await pending;
      await client.query(
        "UPDATE floorwalk.sites SET deactivated_at = NULL WHERE code = 'NB-001'",
      );
      client.release();
      await pool.end();
    }
  });

  it('blocks new inspections at a deactivated site while records and submitted reviews remain available', async () => {
    const todayBefore = await request(app.getHttpServer())
      .get('/api/inspector/today')
      .set('Cookie', inspectorCookie)
      .expect(200);
    const initialToday = todayResponseSchema.parse(todayBefore.body);
    const template = await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', hqCookie)
      .send({
        name: `${testCodePrefix} 停用测试模板`,
        aiEnabled: false,
        items: [
          {
            title: '停用测试检查项',
            minPhotoCount: 0,
            acceptanceCriteria: '',
            critical: false,
          },
        ],
      })
      .expect(201);
    createdTemplateIds.push(template.body.id);
    const created = await request(app.getHttpServer())
      .post('/api/inspections')
      .set('Cookie', inspectorCookie)
      .send({ templateId: template.body.id })
      .expect(201);
    createdInspectionIds.push(created.body.id);
    const detail = await request(app.getHttpServer())
      .get(`/api/inspections/${created.body.id}`)
      .set('Cookie', inspectorCookie)
      .expect(200);
    for (const item of detail.body.items)
      await request(app.getHttpServer())
        .patch(`/api/inspections/${created.body.id}/items/${item.id}`)
        .set('Cookie', inspectorCookie)
        .send({ result: 'pass', note: '现场已检查' })
        .expect(200);
    await request(app.getHttpServer())
      .post(`/api/inspections/${created.body.id}/submit`)
      .set('Cookie', inspectorCookie)
      .expect(201);

    try {
      await request(app.getHttpServer())
        .patch(`/api/admin/sites/${initialToday.site.id}`)
        .set('Cookie', hqCookie)
        .send({ active: false })
        .expect(200);
      const stopped = await request(app.getHttpServer())
        .get('/api/inspector/today')
        .set('Cookie', inspectorCookie)
        .expect(200);
      expect(todayResponseSchema.parse(stopped.body).site.active).toBe(false);
      await request(app.getHttpServer())
        .post('/api/inspections')
        .set('Cookie', inspectorCookie)
        .send({ templateId: template.body.id })
        .expect(409);

      const records = await request(app.getHttpServer())
        .get('/api/inspector/inspections?limit=10')
        .set('Cookie', inspectorCookie)
        .expect(200);
      expect(
        inspectorRecordsResponseSchema
          .parse(records.body)
          .items.some((item) => item.id === created.body.id),
      ).toBe(true);
      const history = await request(app.getHttpServer())
        .get(`/api/inspections/${created.body.id}`)
        .set('Cookie', inspectorCookie)
        .expect(200);
      expect(history.body.status).toBe('submitted');

      await request(app.getHttpServer())
        .post(`/api/inspections/${created.body.id}/review`)
        .set('Cookie', hqCookie)
        .send({ action: 'start' })
        .expect(201);
      const reviewed = await request(app.getHttpServer())
        .post(`/api/inspections/${created.body.id}/review`)
        .set('Cookie', hqCookie)
        .send({ action: 'approve' })
        .expect(201);
      expect(reviewed.body.status).toBe('passed');
    } finally {
      await request(app.getHttpServer())
        .patch(`/api/admin/sites/${initialToday.site.id}`)
        .set('Cookie', hqCookie)
        .send({ active: true })
        .expect(200);
    }
  });
});
