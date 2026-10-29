import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  loginResponseSchema,
  siteResponseSchema,
  templateResponseSchema,
} from '@libs/shared';
import { AppModule } from './app.module.js';
import { createPool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';
import { HttpErrorFilter } from './http-exception.filter.js';

describe('admin API', () => {
  let app: NestExpressApplication;
  let inspectorCookie: string;
  let supervisorCookie: string;
  let hqCookie: string;
  const testCodePrefix = `FW013-${randomUUID()}`;
  const createdTemplateIds: string[] = [];
  const createdInspectionIds: string[] = [];

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();

    const login = async (email: string) => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/session')
        .send({ email, password: 'northbean-demo' })
        .expect(201);
      loginResponseSchema.parse(response.body);
      return (response.headers['set-cookie'] as unknown as string[])[0].split(
        ';',
      )[0];
    };
    inspectorCookie = await login('inspector@northbean.example');
    supervisorCookie = await login('supervisor@northbean.example');
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
    } finally {
      await pool.end();
      await app.close();
    }
  });

  it('persists site creation, rename, deactivation, and reactivation', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/admin/sites')
      .set('Cookie', supervisorCookie)
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
      .set('Cookie', supervisorCookie)
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

  it('allows both administrator roles and rejects inspector access to every site endpoint', async () => {
    for (const cookie of [supervisorCookie, hqCookie]) {
      await request(app.getHttpServer())
        .get('/api/admin/sites')
        .set('Cookie', cookie)
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/admin/sites')
        .set('Cookie', cookie)
        .send({ code: `${testCodePrefix}-${randomUUID()}`, name: '权限门店' })
        .expect(201);
    }

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
      .set('Cookie', supervisorCookie)
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
      .set('Cookie', supervisorCookie)
      .send({ code: '', name: '无效门店' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/admin/sites')
      .set('Cookie', supervisorCookie)
      .send({ code: `${testCodePrefix}-DUP`, name: '重复门店' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/admin/sites')
      .set('Cookie', hqCookie)
      .send({ code: `${testCodePrefix}-DUP`, name: '重复门店二' })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/api/admin/sites/${randomUUID()}`)
      .set('Cookie', supervisorCookie)
      .send({ name: '不存在' })
      .expect(404);
    await request(app.getHttpServer())
      .patch('/api/admin/sites/not-a-uuid')
      .set('Cookie', supervisorCookie)
      .send({ name: '无效 ID' })
      .expect(400);
  });

  it('persists templates transactionally and keeps submitted inspection snapshots unchanged', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', supervisorCookie)
      .send({
        name: `${testCodePrefix} 模板`,
        items: [
          { title: '初始一', photoRequired: false, critical: false },
          { title: '初始二', photoRequired: false, critical: true },
        ],
      })
      .expect(201);
    const template = templateResponseSchema.parse(created.body);
    createdTemplateIds.push(template.id);
    expect(template.isCurrent).toBe(false);
    expect(template.items.map((item) => item.position)).toEqual([1, 2]);

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
        .send({ result: 'pass' })
        .expect(200);
    await request(app.getHttpServer())
      .post(`/api/inspections/${createdInspection.body.id}/submit`)
      .set('Cookie', inspectorCookie)
      .expect(201);

    const readInspectionSnapshot = async (inspectionId: string) => {
      const pool = createPool();
      try {
        const result = await pool.query(
          `SELECT i.status, i.score, ii.position, ii.title, ii.photo_required,
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
    const updated = await request(app.getHttpServer())
      .put(`/api/admin/templates/${template.id}`)
      .set('Cookie', hqCookie)
      .send({
        name: `${testCodePrefix} 模板新版`,
        items: [
          {
            position: 1,
            title: '新版一',
            photoRequired: false,
            critical: true,
          },
          {
            position: 2,
            title: '新版二',
            photoRequired: true,
            critical: false,
          },
          {
            position: 3,
            title: '新版三',
            photoRequired: false,
            critical: false,
          },
        ],
      })
      .expect(200);
    expect(templateResponseSchema.parse(updated.body).items).toHaveLength(3);
    expect(await readInspectionSnapshot(createdInspection.body.id)).toEqual(
      before,
    );

    const selected = await request(app.getHttpServer())
      .post(`/api/admin/templates/${template.id}/current`)
      .set('Cookie', supervisorCookie)
      .expect(200);
    expect(templateResponseSchema.parse(selected.body).isCurrent).toBe(true);
    const listed = await request(app.getHttpServer())
      .get('/api/admin/templates')
      .set('Cookie', hqCookie)
      .expect(200);
    expect(
      listed.body.filter((item: { isCurrent: boolean }) => item.isCurrent),
    ).toEqual([expect.objectContaining({ id: template.id })]);

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
    for (const cookie of [supervisorCookie, hqCookie])
      await request(app.getHttpServer())
        .get('/api/admin/templates')
        .set('Cookie', cookie)
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
        items: [{ title: '项', photoRequired: false, critical: false }],
      })
      .expect(403);
    const template = await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', supervisorCookie)
      .send({
        name: `${testCodePrefix} 权限模板`,
        items: [{ title: '项', photoRequired: false, critical: false }],
      })
      .expect(201);
    createdTemplateIds.push(template.body.id);
    await request(app.getHttpServer())
      .put(`/api/admin/templates/${template.body.id}`)
      .set('Cookie', inspectorCookie)
      .send({
        name: `${testCodePrefix} 权限模板修改`,
        items: [
          {
            position: 1,
            title: '项修改',
            photoRequired: false,
            critical: false,
          },
        ],
      })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/admin/templates/${template.body.id}/current`)
      .set('Cookie', inspectorCookie)
      .expect(403);
  });

  it('validates template items, duplicate names, and missing templates', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', supervisorCookie)
      .send({ name: `${testCodePrefix} 空模板`, items: [] })
      .expect(400);

    const created = await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', supervisorCookie)
      .send({
        name: `${testCodePrefix} 冲突模板`,
        items: [{ title: '项', photoRequired: false, critical: false }],
      })
      .expect(201);
    createdTemplateIds.push(created.body.id);
    await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', hqCookie)
      .send({
        name: `${testCodePrefix} 冲突模板`,
        items: [{ title: '项二', photoRequired: false, critical: false }],
      })
      .expect(409);
    const otherTemplate = await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', supervisorCookie)
      .send({
        name: `${testCodePrefix} 另一模板`,
        items: [{ title: '另一项', photoRequired: false, critical: false }],
      })
      .expect(201);
    createdTemplateIds.push(otherTemplate.body.id);
    await request(app.getHttpServer())
      .put(`/api/admin/templates/${created.body.id}`)
      .set('Cookie', hqCookie)
      .send({
        name: `${testCodePrefix} 另一模板`,
        items: [
          {
            position: 1,
            title: '不应替换',
            photoRequired: false,
            critical: false,
          },
        ],
      })
      .expect(409);
    const retained = await request(app.getHttpServer())
      .get('/api/admin/templates')
      .set('Cookie', supervisorCookie)
      .expect(200);
    expect(
      retained.body.find((item: { id: string }) => item.id === created.body.id)
        .name,
    ).toBe(`${testCodePrefix} 冲突模板`);
    await request(app.getHttpServer())
      .put(`/api/admin/templates/${created.body.id}`)
      .set('Cookie', supervisorCookie)
      .send({
        name: `${testCodePrefix} 冲突模板`,
        items: [
          { position: 2, title: '断序', photoRequired: false, critical: false },
        ],
      })
      .expect(400);
    await request(app.getHttpServer())
      .put(`/api/admin/templates/${created.body.id}`)
      .set('Cookie', supervisorCookie)
      .send({
        name: `${testCodePrefix} 冲突模板`,
        items: [
          { position: 1, title: '项', photoRequired: false, critical: false },
        ],
      })
      .expect(200);
    await request(app.getHttpServer())
      .put(`/api/admin/templates/${randomUUID()}`)
      .set('Cookie', supervisorCookie)
      .send({
        name: `${testCodePrefix} 不存在`,
        items: [
          { position: 1, title: '项', photoRequired: false, critical: false },
        ],
      })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/admin/templates/${randomUUID()}/current`)
      .set('Cookie', hqCookie)
      .expect(404);
  });
});
