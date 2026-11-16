import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../app.module.js';
import { HttpErrorFilter } from '../filters/http-exception.filter.js';
import { createPool } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { seedDatabase } from '../db/seed.js';

describe('store transfer inspection access (FW-024 AC-05)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let admin: string;
  let manager: string;
  let colleague: string;
  let managerId: string;
  let colleagueId: string;
  let oldSite: string;
  let newSite: string;
  let templateId: string;
  const createdTaskIds: string[] = [];
  const createdInspectionIds: string[] = [];

  async function login(loginName: string, orgId?: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({ loginName, password: 'northbean-demo', orgId })
      .expect(201);
    return (response.headers['set-cookie'] as unknown as string[])[0].split(
      ';',
    )[0];
  }

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    pool = createPool();
    const sites = await pool.query(
      "SELECT id, code, org_id FROM floorwalk.sites WHERE code IN ('NB-001', 'NB-002')",
    );
    const first = sites.rows.find((row) => row.code === 'NB-001');
    oldSite = first.id;
    newSite = sites.rows.find((row) => row.code === 'NB-002').id;
    managerId = (
      await pool.query(
        "SELECT id FROM floorwalk.users WHERE login_name = 'manager2@northbean.example'",
      )
    ).rows[0].id;
    colleagueId = (
      await pool.query(
        "SELECT id FROM floorwalk.users WHERE login_name = 'inspector@northbean.example'",
      )
    ).rows[0].id;
    templateId = (
      await pool.query(
        'SELECT id FROM floorwalk.templates WHERE org_id = $1 ORDER BY created_at LIMIT 1',
        [first.org_id],
      )
    ).rows[0].id;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
    admin = await login('hq@northbean.example');
    manager = await login('manager2@northbean.example');
    colleague = await login('inspector@northbean.example', first.org_id);
  }, 60000);

  afterAll(async () => {
    try {
      await pool.query(
        'UPDATE floorwalk.users SET site_id = $1 WHERE id = $2',
        [oldSite, managerId],
      );
      await pool.query(
        `DELETE FROM floorwalk.sessions WHERE user_id IN
         (SELECT id FROM floorwalk.users WHERE login_name = ANY($1::text[]))`,
        [['hq@northbean.example', 'manager2@northbean.example']],
      );
      await pool.query(
        'DELETE FROM floorwalk.chat_messages WHERE inspection_id = ANY($1::uuid[])',
        [createdInspectionIds],
      );
      await pool.query(
        `DELETE FROM floorwalk.inspection_item_decisions WHERE inspection_item_id IN
         (SELECT id FROM floorwalk.inspection_items WHERE inspection_id = ANY($1::uuid[]))`,
        [createdInspectionIds],
      );
      await pool.query(
        `DELETE FROM floorwalk.evidence WHERE inspection_item_id IN
         (SELECT id FROM floorwalk.inspection_items WHERE inspection_id = ANY($1::uuid[]))`,
        [createdInspectionIds],
      );
      await pool.query(
        'DELETE FROM floorwalk.reviews WHERE inspection_id = ANY($1::uuid[])',
        [createdInspectionIds],
      );
      await pool.query(
        'DELETE FROM floorwalk.inspection_items WHERE inspection_id = ANY($1::uuid[])',
        [createdInspectionIds],
      );
      await pool.query(
        'DELETE FROM floorwalk.inspections WHERE id = ANY($1::uuid[])',
        [createdInspectionIds],
      );
      await pool.query(
        'DELETE FROM floorwalk.inspection_tasks WHERE id = ANY($1::uuid[])',
        [createdTaskIds],
      );
    } finally {
      await pool.end();
      await app.close();
    }
  });

  it('retains only participated old-site records and uses the new site for today', async () => {
    async function create(assignedInspectorId: string, participated: boolean) {
      const task = await pool.query<{ id: string }>(
        `INSERT INTO floorwalk.inspection_tasks
           (org_id, site_id, template_id, task_date, position, occurrence,
            starts_at, due_at, status)
         SELECT site.org_id, site.id, $2, CURRENT_DATE, 900 + $3, 0,
           now() - (4 + $3) * interval '1 hour',
           now() - (3 + $3) * interval '1 hour', 'submitted'
         FROM floorwalk.sites site WHERE site.id = $1
         RETURNING id`,
        [oldSite, templateId, createdTaskIds.length],
      );
      const taskId = task.rows[0].id;
      createdTaskIds.push(taskId);
      const inspection = await pool.query<{ id: string }>(
        `INSERT INTO floorwalk.inspections
           (task_id, site_id, template_id, inspector_id, status, score,
            submitted_at, decided_at)
         VALUES ($1, $2, $3, $4, 'passed', 100, now(), now())
         RETURNING id`,
        [taskId, oldSite, templateId, assignedInspectorId],
      );
      const inspectionId = inspection.rows[0].id;
      createdInspectionIds.push(inspectionId);
      await pool.query(
        `INSERT INTO floorwalk.inspection_items
           (inspection_id, position, title, critical, min_photo_count,
            acceptance_criteria, result, self_assessment, first_self_assessment,
            first_result, uploaded_by_id, uploaded_at, note)
         SELECT $1, position, title, critical, min_photo_count,
           acceptance_criteria, 'pass', 'pass', 'pass', 'pass', $2, now(),
           '现场已检查'
         FROM floorwalk.template_items WHERE template_id = $3`,
        [inspectionId, assignedInspectorId, templateId],
      );
      if (participated)
        await pool.query(
          `INSERT INTO floorwalk.inspection_participants (inspection_id, user_id)
           VALUES ($1, $2)`,
          [inspectionId, managerId],
        );
      return inspectionId;
    }
    const own = await create(managerId, true);
    const worked = await create(colleagueId, true);
    const untouched = await create(colleagueId, false);
    const detail = await request(app.getHttpServer())
      .get(`/api/inspections/${worked}`)
      .set('Cookie', manager)
      .expect(200);
    const itemId = detail.body.items[0].id;
    const untouchedDetail = await request(app.getHttpServer())
      .get(`/api/inspections/${untouched}`)
      .set('Cookie', colleague)
      .expect(200);
    async function addImages(inspectionId: string, inspectionItemId: string) {
      const evidence = await pool.query(
        `INSERT INTO floorwalk.evidence (inspection_item_id, storage_key, mime, size)
         VALUES ($1, $2, 'image/png', 1) RETURNING id`,
        [inspectionItemId, `test/${inspectionId}.png`],
      );
      const message = await pool.query(
        `INSERT INTO floorwalk.chat_messages (inspection_id, author_id, storage_key, mime, size)
         VALUES ($1, $2, $3, 'image/png', 1) RETURNING id`,
        [inspectionId, managerId, `test/chat-${inspectionId}.png`],
      );
      return { evidenceId: evidence.rows[0].id, messageId: message.rows[0].id };
    }
    const workedImages = await addImages(worked, itemId);
    const untouchedImages = await addImages(
      untouched,
      untouchedDetail.body.items[0].id,
    );
    await request(app.getHttpServer())
      .patch(`/api/admin/users/${managerId}`)
      .set('Cookie', admin)
      .send({ siteId: newSite })
      .expect(200);
    const today = await request(app.getHttpServer())
      .get('/api/inspector/today')
      .set('Cookie', manager)
      .expect(200);
    expect(today.body.site.id).toBe(newSite);
    const records = await request(app.getHttpServer())
      .get('/api/inspector/inspections?limit=50')
      .set('Cookie', manager)
      .expect(200);
    const ids = records.body.items.map((item: { id: string }) => item.id);
    expect(ids).toEqual(expect.arrayContaining([own, worked]));
    expect(ids).not.toContain(untouched);
    for (const id of [own, worked])
      await request(app.getHttpServer())
        .get(`/api/inspections/${id}`)
        .set('Cookie', manager)
        .expect(200);
    await request(app.getHttpServer())
      .get(`/api/inspections/${untouched}`)
      .set('Cookie', manager)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/inspections/${worked}/messages`)
      .set('Cookie', manager)
      .expect(200);
    for (const [images, status] of [
      [workedImages, 200],
      [untouchedImages, 404],
    ] as const) {
      await request(app.getHttpServer())
        .get(`/api/evidence/${images.evidenceId}`)
        .set('Cookie', manager)
        .expect(status);
      await request(app.getHttpServer())
        .get(`/api/messages/${images.messageId}/image-url`)
        .set('Cookie', manager)
        .expect(status);
    }
    await request(app.getHttpServer())
      .post(`/api/inspections/${worked}/messages`)
      .set('Cookie', manager)
      .send({ text: 'test' })
      .expect(404);
  });
});
