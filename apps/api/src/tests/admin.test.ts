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
import { AppModule } from '../app.module.js';
import { createPool } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { seedDatabase } from '../db/seed.js';
import { HttpErrorFilter } from '../filters/http-exception.filter.js';
import { getStorageDriver } from '../storage/index.js';

describe('admin API', () => {
  let app: NestExpressApplication;
  let inspectorCookie: string;
  let hqCookie: string;
  let initialTemplateId: string;
  const testCodePrefix = `FW013-${randomUUID()}`;
  const createdTemplateIds: string[] = [];
  const createdInspectionIds: string[] = [];
  const createdTaskIds: string[] = [];
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
      if (createdTaskIds.length)
        await pool.query(
          'DELETE FROM floorwalk.inspection_tasks WHERE id = ANY($1::uuid[])',
          [createdTaskIds],
        );
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
    const createTask = async (templateId: string) => {
      const pool = createPool();
      try {
        const result = await pool.query<{ id: string }>(
          `INSERT INTO floorwalk.inspection_tasks
             (org_id, site_id, template_id, task_date, position, occurrence,
              starts_at, due_at, status)
           SELECT manager.org_id, manager.site_id, $1, CURRENT_DATE, 99, $2,
             now() - interval '2 hours', now() + interval '2 hours', 'in_progress'
           FROM floorwalk.users manager
           WHERE manager.login_name = 'manager2@northbean.example'
           RETURNING id`,
          [templateId, Math.floor(Math.random() * 1_000_000_000)],
        );
        return result.rows[0].id;
      } finally {
        await pool.end();
      }
    };
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
      const foreignTaskId = (
        await foreignPool.query(
          "SELECT task.id FROM floorwalk.inspection_tasks task JOIN floorwalk.organizations o ON o.id = task.org_id WHERE o.name = '演示二号' ORDER BY task.created_at DESC LIMIT 1",
        )
      ).rows[0].id;
      await request(app.getHttpServer())
        .post(`/api/tasks/${foreignTaskId}/items/1/uploads`)
        .set('Cookie', inspectorCookie)
        .field('selfAssessment', 'pass')
        .field('note', '现场已检查')
        .expect(404);
    } finally {
      await foreignPool.end();
    }

    const taskId = await createTask(template.id);
    createdTaskIds.push(taskId);
    const photo = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#ffffff' },
    })
      .jpeg()
      .toBuffer();
    const upload = (position: number, photoCount: number, note?: string) => {
      let uploadRequest = request(app.getHttpServer())
        .post(`/api/tasks/${taskId}/items/${position}/uploads`)
        .set('Cookie', inspectorCookie)
        .field('selfAssessment', 'pass');
      if (note !== undefined) uploadRequest = uploadRequest.field('note', note);
      for (let index = 0; index < photoCount; index += 1)
        uploadRequest = uploadRequest.attach('files', photo, {
          filename: `fw026-${position}-${index}.jpg`,
          contentType: 'image/jpeg',
        });
      return uploadRequest;
    };
    const uploadedPhotoItem = await upload(2, 2).expect(201);
    createdInspectionIds.push(uploadedPhotoItem.body.inspectionId);
    for (const evidence of uploadedPhotoItem.body.evidence)
      createdEvidenceKeys.push(evidence.storageKey);
    await upload(2, 1).expect(422);
    await upload(1, 0, '   ').expect(422);
    const uploadedNoteItem = await upload(1, 0, '现场已检查').expect(201);
    expect(uploadedNoteItem.body.inspectionId).toBe(
      uploadedPhotoItem.body.inspectionId,
    );
    expect(
      (
        await request(app.getHttpServer())
          .get(`/api/tasks/${taskId}/review`)
          .set('Cookie', hqCookie)
          .expect(200)
      ).body.status,
    ).toBe('submitted');

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
    const before = await readInspectionSnapshot(
      uploadedPhotoItem.body.inspectionId,
    );
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
    expect(
      await readInspectionSnapshot(uploadedPhotoItem.body.inspectionId),
    ).toEqual(before);

    const nextTaskId = await createTask(template.id);
    createdTaskIds.push(nextTaskId);
    const nextUpload = await request(app.getHttpServer())
      .post(`/api/tasks/${nextTaskId}/items/1/uploads`)
      .set('Cookie', inspectorCookie)
      .field('selfAssessment', 'pass')
      .field('note', '现场已检查')
      .expect(201);
    createdInspectionIds.push(nextUpload.body.inspectionId);
    const copiedItems = await request(app.getHttpServer())
      .get(`/api/tasks/${nextTaskId}/review`)
      .set('Cookie', hqCookie)
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

  it('waits for an in-flight deactivation before allowing a task to start', async () => {
    const pool = createPool();
    const client = await pool.connect();
    let pending: Promise<request.Response> | undefined;
    let taskId: string | undefined;
    let siteId: string | undefined;
    try {
      const site = await client.query<{ id: string }>(
        `SELECT site.id FROM floorwalk.sites site
         JOIN floorwalk.users manager ON manager.site_id = site.id
         WHERE manager.login_name = 'manager2@northbean.example'`,
      );
      siteId = site.rows[0].id;
      const task = await pool.query<{ id: string }>(
        `INSERT INTO floorwalk.inspection_tasks
           (org_id, site_id, template_id, task_date, position, occurrence,
            starts_at, due_at, status)
         SELECT manager.org_id, manager.site_id, $1, CURRENT_DATE, 99, $2,
           now() - interval '2 hours', now() + interval '2 hours', 'in_progress'
         FROM floorwalk.users manager
         WHERE manager.login_name = 'manager2@northbean.example'
         RETURNING id`,
        [initialTemplateId, Math.floor(Math.random() * 1_000_000_000)],
      );
      taskId = task.rows[0].id;
      createdTaskIds.push(taskId);
      const item = await pool.query<{
        position: number;
        minPhotoCount: number;
      }>(
        `SELECT position, min_photo_count AS "minPhotoCount"
         FROM floorwalk.template_items WHERE template_id = $1
         ORDER BY position LIMIT 1`,
        [initialTemplateId],
      );
      await client.query('BEGIN');
      await client.query(
        'UPDATE floorwalk.sites SET deactivated_at = now() WHERE id = $1',
        [siteId],
      );
      const blocker = await client.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      let uploadRequest = request(app.getHttpServer())
        .post(`/api/tasks/${taskId}/items/${item.rows[0].position}/uploads`)
        .set('Cookie', inspectorCookie)
        .field('selfAssessment', 'pass');
      if (item.rows[0].minPhotoCount === 0)
        uploadRequest = uploadRequest.field('note', '现场已检查');
      else
        for (let index = 0; index < item.rows[0].minPhotoCount; index += 1)
          uploadRequest = uploadRequest.attach(
            'files',
            Buffer.from('deactivation-test'),
            {
              filename: `deactivation-${index}.jpg`,
              contentType: 'image/jpeg',
            },
          );
      pending = uploadRequest.then((response) => {
        if (response.status === 201)
          createdInspectionIds.push(response.body.inspectionId);
        return response;
      });
      await expect
        .poll(async () => {
          const waiting = await pool.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM pg_stat_activity
           WHERE datname = current_database()
             AND $1 = ANY(pg_blocking_pids(pid))
             AND query LIKE '%FROM floorwalk.sites%FOR SHARE%'`,
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
        'UPDATE floorwalk.sites SET deactivated_at = NULL WHERE id = $1',
        [siteId],
      );
      client.release();
      await pool.end();
    }
  });

  it('keeps historical records and task reviews available after site deactivation', async () => {
    const todayBefore = await request(app.getHttpServer())
      .get('/api/inspector/today')
      .set('Cookie', inspectorCookie)
      .expect(200);
    const initialToday = todayResponseSchema.parse(todayBefore.body);
    const pool = createPool();
    let inspectionId: string;
    let taskId: string;
    try {
      const latest = await pool.query<{
        inspectionId: string;
        taskId: string;
      }>(
        `SELECT inspection.id AS "inspectionId", task.id AS "taskId"
         FROM floorwalk.inspections inspection
         JOIN floorwalk.inspection_tasks task ON task.id = inspection.task_id
         WHERE inspection.site_id = $1
         ORDER BY inspection.created_at DESC LIMIT 1`,
        [initialToday.site.id],
      );
      inspectionId = latest.rows[0].inspectionId;
      taskId = latest.rows[0].taskId;
    } finally {
      await pool.end();
    }
    const before = await request(app.getHttpServer())
      .get(`/api/inspections/${inspectionId}`)
      .set('Cookie', inspectorCookie)
      .expect(200);
    const taskReviewBefore = await request(app.getHttpServer())
      .get(`/api/tasks/${taskId}/review`)
      .set('Cookie', hqCookie)
      .expect(200);

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
      const records = await request(app.getHttpServer())
        .get('/api/inspector/inspections?limit=10')
        .set('Cookie', inspectorCookie)
        .expect(200);
      expect(
        inspectorRecordsResponseSchema
          .parse(records.body)
          .items.some((item) => item.id === inspectionId),
      ).toBe(true);
      const history = await request(app.getHttpServer())
        .get(`/api/inspections/${inspectionId}`)
        .set('Cookie', inspectorCookie)
        .expect(200);
      const reviewed = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}/review`)
        .set('Cookie', hqCookie)
        .expect(200);
      expect(history.body.status).toBe(before.body.status);
      expect(reviewed.body.inspectionId).toBe(
        taskReviewBefore.body.inspectionId,
      );
    } finally {
      await request(app.getHttpServer())
        .patch(`/api/admin/sites/${initialToday.site.id}`)
        .set('Cookie', hqCookie)
        .send({ active: true })
        .expect(200);
    }
  });
});
