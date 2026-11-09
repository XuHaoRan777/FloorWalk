import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from './app.module.js';
import { HttpErrorFilter } from './http-exception.filter.js';
import { createPool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';

describe('store transfer inspection access (FW-024 AC-05)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let admin: string;
  let manager: string;
  let colleague: string;
  let managerId: string;
  let oldSite: string;
  let newSite: string;
  let templateId: string;
  const created: string[] = [];

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
    templateId = (
      await pool.query(
        'SELECT id FROM floorwalk.templates WHERE org_id = $1 AND is_current',
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
        'DELETE FROM floorwalk.chat_messages WHERE inspection_id = ANY($1::uuid[])',
        [created],
      );
      await pool.query(
        'DELETE FROM floorwalk.evidence WHERE inspection_item_id IN (SELECT id FROM floorwalk.inspection_items WHERE inspection_id = ANY($1::uuid[]))',
        [created],
      );
      await pool.query(
        'DELETE FROM floorwalk.inspection_items WHERE inspection_id = ANY($1::uuid[])',
        [created],
      );
      await pool.query(
        'DELETE FROM floorwalk.inspections WHERE id = ANY($1::uuid[])',
        [created],
      );
    } finally {
      await pool.end();
      await app.close();
    }
  });

  it('retains only participated old-site records and uses the new site for today and creation', async () => {
    async function create(cookie: string) {
      const response = await request(app.getHttpServer())
        .post('/api/inspections')
        .set('Cookie', cookie)
        .send({ templateId })
        .expect(201);
      created.push(response.body.id);
      return response.body.id as string;
    }
    const own = await create(manager);
    const worked = await create(colleague);
    const untouched = await create(colleague);
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
      .patch(`/api/inspections/${worked}/items/${itemId}`)
      .set('Cookie', manager)
      .send({ result: 'pass' })
      .expect(200);
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
    const newInspection = await create(manager);
    expect(
      (
        await pool.query(
          'SELECT site_id FROM floorwalk.inspections WHERE id = $1',
          [newInspection],
        )
      ).rows[0].site_id,
    ).toBe(newSite);
    const records = await request(app.getHttpServer())
      .get('/api/inspector/inspections?limit=50')
      .set('Cookie', manager)
      .expect(200);
    const ids = records.body.items.map((item: { id: string }) => item.id);
    expect(ids).toEqual(expect.arrayContaining([own, worked, newInspection]));
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
      .patch(`/api/inspections/${worked}/items/${itemId}`)
      .set('Cookie', manager)
      .send({ result: 'fail' })
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
