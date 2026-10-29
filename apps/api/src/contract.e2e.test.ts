import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from './app.module.js';
import { DATABASE_POOL } from './db/pool.provider.js';
import { HttpErrorFilter } from './http-exception.filter.js';
import { createPool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';
import {
  apiRoutes,
  adminSitesResponseSchema,
  adminTemplatesResponseSchema,
  chatMessageSchema,
  chatMessagesResponseSchema,
  dashboardSitesResponseSchema,
  evidenceSchema,
  inspectionDetailSchema,
  inspectionSchema,
  inspectorRecordsResponseSchema,
  loginResponseSchema,
  reviewQueueResponseSchema,
  reviewResponseSchema,
  siteResponseSchema,
  signedEvidenceResponseSchema,
  chatImageUrlResponseSchema,
  submitInspectionResponseSchema,
  todayResponseSchema,
  templateResponseSchema,
  updateInspectionItemResponseSchema,
  userSchema,
  errorResponseSchema,
  userRoles,
} from '@libs/shared';

describe('inspection contract API', () => {
  let app: NestExpressApplication;
  let inspectorCookie: string;
  let supervisorCookie: string;
  let hqCookie: string;
  let inspectionId: string;
  let otherSiteInspectionId: string;
  let seedEvidenceId: string;
  let templateId: string;
  let chatInspectionId: string;
  let chatImageMessageId: string;
  let nb002InspectorCookie: string;
  let createdInspectionId: string | undefined;
  let createdEvidenceId: string | undefined;
  let createdEvidenceStorageKey: string | undefined;
  const createdChatMessageIds: string[] = [];
  const createdAdminSiteIds: string[] = [];
  const createdAdminTemplateIds: string[] = [];
  const createdChatStorageKeys: string[] = [];

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.enableCors({ origin: true, credentials: true });
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
    nb002InspectorCookie = await login('inspector+nb-002@northbean.example');
    supervisorCookie = await login('supervisor@northbean.example');
    hqCookie = await login('hq@northbean.example');

    const pool = createPool();
    try {
      const template = await pool.query<{ id: string }>(
        'SELECT id FROM floorwalk.templates LIMIT 1',
      );
      templateId = template.rows[0].id;
      const chatInspection = await pool.query<{ id: string }>(
        `SELECT i.id FROM floorwalk.inspections i
         JOIN floorwalk.sites s ON s.id = i.site_id
         WHERE s.code = 'NB-002' AND i.status = 'rework' ORDER BY i.created_at DESC LIMIT 1`,
      );
      chatInspectionId = chatInspection.rows[0].id;
      const chatImage = await pool.query<{ id: string }>(
        'SELECT id FROM floorwalk.chat_messages WHERE inspection_id = $1 AND storage_key IS NOT NULL',
        [chatInspectionId],
      );
      chatImageMessageId = chatImage.rows[0].id;
      const result = await pool.query<{ id: string; code: string }>(
        `SELECT i.id, s.code FROM floorwalk.inspections i
         JOIN floorwalk.sites s ON s.id = i.site_id ORDER BY i.created_at`,
      );
      inspectionId = result.rows.find((row) => row.code === 'NB-001')!.id;
      otherSiteInspectionId = result.rows.find(
        (row) => row.code !== 'NB-001',
      )!.id;
      const evidence = await pool.query<{ id: string }>(
        `SELECT e.id FROM floorwalk.evidence e
         JOIN floorwalk.inspection_items ii ON ii.id = e.inspection_item_id
         JOIN floorwalk.inspections i ON i.id = ii.inspection_id
         JOIN floorwalk.sites s ON s.id = i.site_id
         WHERE s.code = 'NB-001' ORDER BY e.created_at LIMIT 1`,
      );
      seedEvidenceId = evidence.rows[0].id;
    } finally {
      await pool.end();
    }
  }, 60000);

  afterAll(async () => {
    const pool = createPool();
    try {
      if (createdInspectionId) {
        await pool.query(
          'DELETE FROM floorwalk.chat_messages WHERE inspection_id = $1',
          [createdInspectionId],
        );
        await pool.query(
          `DELETE FROM floorwalk.evidence WHERE inspection_item_id IN
           (SELECT id FROM floorwalk.inspection_items WHERE inspection_id = $1)`,
          [createdInspectionId],
        );
        await pool.query(
          'DELETE FROM floorwalk.inspection_items WHERE inspection_id = $1',
          [createdInspectionId],
        );
        await pool.query(
          'DELETE FROM floorwalk.reviews WHERE inspection_id = $1',
          [createdInspectionId],
        );
        await pool.query('DELETE FROM floorwalk.inspections WHERE id = $1', [
          createdInspectionId,
        ]);
      }
      if (createdChatMessageIds.length)
        await pool.query(
          'DELETE FROM floorwalk.chat_messages WHERE id = ANY($1::uuid[])',
          [createdChatMessageIds],
        );
      const cleanup = await pool.connect();
      try {
        await cleanup.query('BEGIN');
        await cleanup.query(
          'UPDATE floorwalk.templates SET is_current = false WHERE is_current',
        );
        await cleanup.query(
          'UPDATE floorwalk.templates SET is_current = true WHERE id = $1',
          [templateId],
        );
        await cleanup.query(
          'DELETE FROM floorwalk.template_items WHERE template_id = ANY($1::uuid[])',
          [createdAdminTemplateIds],
        );
        await cleanup.query(
          'DELETE FROM floorwalk.templates WHERE id = ANY($1::uuid[])',
          [createdAdminTemplateIds],
        );
        await cleanup.query(
          'DELETE FROM floorwalk.sites WHERE id = ANY($1::uuid[])',
          [createdAdminSiteIds],
        );
        await cleanup.query('COMMIT');
      } catch (error) {
        await cleanup.query('ROLLBACK');
        throw error;
      } finally {
        cleanup.release();
      }
      await pool.query('DELETE FROM floorwalk.sessions');
      if (createdEvidenceStorageKey) {
        await rm(
          path.resolve(
            process.env.STORAGE_DIR ?? path.join('apps', 'api', '.storage'),
            createdEvidenceStorageKey,
          ),
          { force: true },
        );
      }
      for (const storageKey of createdChatStorageKeys)
        await rm(
          path.resolve(
            process.env.STORAGE_DIR ?? path.join('apps', 'api', '.storage'),
            storageKey,
          ),
          { force: true },
        );
    } finally {
      await pool.end();
      await app.close();
      const remaining = createPool();
      try {
        const { rows } = await remaining.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM pg_stat_activity
           WHERE datname = current_database()
             AND application_name = 'floorwalk-api'`,
        );
        expect(Number(rows[0].count)).toBe(0);
      } finally {
        await remaining.end();
      }
    }
  });

  it('publishes the complete route table under /api', () => {
    expect(Object.keys(apiRoutes)).toHaveLength(24);
    for (const route of Object.values(apiRoutes)) {
      expect(route.path.startsWith('/api/')).toBe(true);
      expect(route.responseSchema).toBeDefined();
      expect([200, 201, 204]).toContain(route.successStatus);
    }
  });

  it('authenticates roles and enforces site and role access', async () => {
    const me = await request(app.getHttpServer())
      .get('/api/me')
      .set('Cookie', inspectorCookie)
      .expect(200);
    expect(userSchema.parse(me.body).role).toBe('inspector');
    await request(app.getHttpServer())
      .get(`/api/inspections/${otherSiteInspectionId}`)
      .set('Cookie', inspectorCookie)
      .expect(403)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('FORBIDDEN'),
      );
    await request(app.getHttpServer())
      .get('/api/dashboard/sites')
      .set('Cookie', inspectorCookie)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/inspections/${inspectionId}/review`)
      .set('Cookie', hqCookie)
      .send({ action: 'approve' })
      .expect(403);
    await request(app.getHttpServer()).get('/api/me').expect(401);
    const deniedByRoute = new Map<
      string,
      Partial<
        Record<
          (typeof userRoles)[number],
          () => Promise<{ status: number; body: unknown }>
        >
      >
    >([
      [
        'today',
        {
          supervisor: async () => {
            const response = await request(app.getHttpServer())
              .get('/api/inspector/today')
              .set('Cookie', supervisorCookie);
            return { status: response.status, body: response.body };
          },
          hq: async () => {
            const response = await request(app.getHttpServer())
              .get('/api/inspector/today')
              .set('Cookie', hqCookie);
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'createInspection',
        {
          supervisor: async () => {
            const response = await request(app.getHttpServer())
              .post('/api/inspections')
              .set('Cookie', supervisorCookie)
              .send({ templateId });
            return { status: response.status, body: response.body };
          },
          hq: async () => {
            const response = await request(app.getHttpServer())
              .post('/api/inspections')
              .set('Cookie', hqCookie)
              .send({ templateId });
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'updateInspectionItem',
        {
          supervisor: async () => {
            const response = await request(app.getHttpServer())
              .patch(
                `/api/inspections/${inspectionId}/items/00000000-0000-4000-8000-000000000000`,
              )
              .set('Cookie', supervisorCookie)
              .send({ result: 'pass' });
            return { status: response.status, body: response.body };
          },
          hq: async () => {
            const response = await request(app.getHttpServer())
              .patch(
                `/api/inspections/${inspectionId}/items/00000000-0000-4000-8000-000000000000`,
              )
              .set('Cookie', hqCookie)
              .send({ result: 'pass' });
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'addEvidence',
        {
          supervisor: async () => {
            const response = await request(app.getHttpServer())
              .post(
                `/api/inspections/${inspectionId}/items/00000000-0000-4000-8000-000000000000/evidence`,
              )
              .set('Cookie', supervisorCookie);
            return { status: response.status, body: response.body };
          },
          hq: async () => {
            const response = await request(app.getHttpServer())
              .post(
                `/api/inspections/${inspectionId}/items/00000000-0000-4000-8000-000000000000/evidence`,
              )
              .set('Cookie', hqCookie);
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'submitInspection',
        {
          supervisor: async () => {
            const response = await request(app.getHttpServer())
              .post(`/api/inspections/${inspectionId}/submit`)
              .set('Cookie', supervisorCookie);
            return { status: response.status, body: response.body };
          },
          hq: async () => {
            const response = await request(app.getHttpServer())
              .post(`/api/inspections/${inspectionId}/submit`)
              .set('Cookie', hqCookie);
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'reviewQueue',
        {
          inspector: async () => {
            const response = await request(app.getHttpServer())
              .get('/api/review/queue')
              .set('Cookie', inspectorCookie);
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'reviewInspection',
        {
          inspector: async () => {
            const response = await request(app.getHttpServer())
              .post(`/api/inspections/${inspectionId}/review`)
              .set('Cookie', inspectorCookie)
              .send({ action: 'approve' });
            return { status: response.status, body: response.body };
          },
          hq: async () => {
            const response = await request(app.getHttpServer())
              .post(`/api/inspections/${inspectionId}/review`)
              .set('Cookie', hqCookie)
              .send({ action: 'approve' });
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'dashboardSites',
        {
          inspector: async () => {
            const response = await request(app.getHttpServer())
              .get('/api/dashboard/sites')
              .set('Cookie', inspectorCookie);
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'createInspectionMessage',
        {
          hq: async () => {
            const response = await request(app.getHttpServer())
              .post(`/api/inspections/${inspectionId}/messages`)
              .set('Cookie', hqCookie)
              .field('text', '越权测试消息');
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'listInspectorInspections',
        {
          supervisor: async () => {
            const response = await request(app.getHttpServer())
              .get('/api/inspector/inspections')
              .set('Cookie', supervisorCookie);
            return { status: response.status, body: response.body };
          },
          hq: async () => {
            const response = await request(app.getHttpServer())
              .get('/api/inspector/inspections')
              .set('Cookie', hqCookie);
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'listAdminSites',
        {
          inspector: async () => {
            const response = await request(app.getHttpServer())
              .get('/api/admin/sites')
              .set('Cookie', inspectorCookie);
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'createAdminSite',
        {
          inspector: async () => {
            const response = await request(app.getHttpServer())
              .post('/api/admin/sites')
              .set('Cookie', inspectorCookie)
              .send({ code: 'FW-011-TEST', name: '测试门店' });
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'updateAdminSite',
        {
          inspector: async () => {
            const response = await request(app.getHttpServer())
              .patch(`/api/admin/sites/${inspectionId}`)
              .set('Cookie', inspectorCookie)
              .send({ active: false });
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'listAdminTemplates',
        {
          inspector: async () => {
            const response = await request(app.getHttpServer())
              .get('/api/admin/templates')
              .set('Cookie', inspectorCookie);
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'createAdminTemplate',
        {
          inspector: async () => {
            const response = await request(app.getHttpServer())
              .post('/api/admin/templates')
              .set('Cookie', inspectorCookie)
              .send({
                name: '测试模板',
                items: [
                  { title: '测试项', photoRequired: false, critical: false },
                ],
              });
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'updateAdminTemplate',
        {
          inspector: async () => {
            const response = await request(app.getHttpServer())
              .put(`/api/admin/templates/${templateId}`)
              .set('Cookie', inspectorCookie)
              .send({
                name: '测试模板',
                items: [
                  {
                    position: 1,
                    title: '测试项',
                    photoRequired: false,
                    critical: false,
                  },
                ],
              });
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'setCurrentAdminTemplate',
        {
          inspector: async () => {
            const response = await request(app.getHttpServer())
              .post(`/api/admin/templates/${templateId}/current`)
              .set('Cookie', inspectorCookie);
            return { status: response.status, body: response.body };
          },
        },
      ],
    ]);
    for (const [routeKey, route] of Object.entries(apiRoutes)) {
      if (route.roles.length === 0) continue;
      for (const role of userRoles) {
        if ((route.roles as readonly string[]).includes(role)) continue;
        const deniedRequest = deniedByRoute.get(routeKey)?.[role];
        expect(deniedRequest, `${routeKey} denied for ${role}`).toBeDefined();
        if (!deniedRequest) continue;
        const response = await deniedRequest();
        expect(response.status).toBe(403);
        expect(errorResponseSchema.parse(response.body).code).toBe('FORBIDDEN');
      }
    }
  }, 60000);

  it('serves the new records, site, and template route schemas', async () => {
    const records = await request(app.getHttpServer())
      .get('/api/inspector/inspections?limit=10')
      .set('Cookie', inspectorCookie)
      .expect(200);
    const recordPage = inspectorRecordsResponseSchema.parse(records.body);
    expect(recordPage.items.length).toBeGreaterThan(0);
    expect(recordPage.items.every((item) => item.id)).toBe(true);

    const sites = await request(app.getHttpServer())
      .get('/api/admin/sites')
      .set('Cookie', supervisorCookie)
      .expect(200);
    expect(adminSitesResponseSchema.parse(sites.body)).toHaveLength(12);

    const createdSite = await request(app.getHttpServer())
      .post('/api/admin/sites')
      .set('Cookie', supervisorCookie)
      .send({ code: 'FW-011-TEMP', name: '临时门店' })
      .expect(201);
    expect(createdSite.body.active).toBe(true);
    createdAdminSiteIds.push(createdSite.body.id);

    const templates = await request(app.getHttpServer())
      .get('/api/admin/templates')
      .set('Cookie', supervisorCookie)
      .expect(200);
    expect(adminTemplatesResponseSchema.parse(templates.body)).toHaveLength(1);

    const createdTemplate = await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', supervisorCookie)
      .send({
        name: 'FW-011 临时模板',
        items: [{ title: '测试项', photoRequired: false, critical: false }],
      })
      .expect(201);
    templateResponseSchema.parse(createdTemplate.body);
    createdAdminTemplateIds.push(createdTemplate.body.id);
    expect(createdTemplate.body.isCurrent).toBe(false);

    const updatedSite = await request(app.getHttpServer())
      .patch(`/api/admin/sites/${createdSite.body.id}`)
      .set('Cookie', supervisorCookie)
      .send({ active: false })
      .expect(200);
    siteResponseSchema.parse(updatedSite.body);

    const updatedTemplate = await request(app.getHttpServer())
      .put(`/api/admin/templates/${createdTemplate.body.id}`)
      .set('Cookie', supervisorCookie)
      .send({
        name: '开店检查更新',
        items: [
          {
            position: 1,
            title: '测试项',
            photoRequired: false,
            critical: false,
          },
        ],
      })
      .expect(200);
    templateResponseSchema.parse(updatedTemplate.body);

    const currentTemplate = await request(app.getHttpServer())
      .post(`/api/admin/templates/${createdTemplate.body.id}/current`)
      .set('Cookie', supervisorCookie)
      .expect(200);
    templateResponseSchema.parse(currentTemplate.body);
    expect(currentTemplate.body.isCurrent).toBe(true);
    await request(app.getHttpServer())
      .post(`/api/admin/templates/${templateId}/current`)
      .set('Cookie', supervisorCookie)
      .expect(200);

    for (const path of ['/api/admin/sites', '/api/admin/templates'])
      await request(app.getHttpServer())
        .get(path)
        .set('Cookie', inspectorCookie)
        .expect(403);
    await request(app.getHttpServer())
      .post('/api/admin/sites')
      .set('Cookie', inspectorCookie)
      .send({ code: 'DENIED', name: '拒绝' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/admin/sites/${sites.body[0].id}`)
      .set('Cookie', inspectorCookie)
      .send({ active: false })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', inspectorCookie)
      .send({
        name: '拒绝',
        items: [{ title: '项', photoRequired: false, critical: false }],
      })
      .expect(403);
    await request(app.getHttpServer())
      .put(`/api/admin/templates/${templateId}`)
      .set('Cookie', inspectorCookie)
      .send({
        name: '拒绝',
        items: [
          { position: 1, title: '项', photoRequired: false, critical: false },
        ],
      })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/admin/templates/${templateId}/current`)
      .set('Cookie', inspectorCookie)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/inspector/inspections')
      .set('Cookie', supervisorCookie)
      .expect(403);
  });

  it('paginates records with sub-millisecond timestamp precision', async () => {
    const pool = createPool();
    let recordIds: string[] = [];
    try {
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO floorwalk.inspections
           (site_id, template_id, inspector_id, created_at)
         SELECT site.id, $1, inspector.id, $2::timestamptz
         FROM floorwalk.sites site
         CROSS JOIN floorwalk.users inspector
         CROSS JOIN generate_series(1, 3)
         WHERE site.code = 'NB-001'
           AND inspector.email = 'inspector@northbean.example'
         RETURNING id`,
        [templateId, '2099-10-29T12:00:00.123456Z'],
      );
      recordIds = inserted.rows.map((row) => row.id);

      const first = inspectorRecordsResponseSchema.parse(
        (
          await request(app.getHttpServer())
            .get('/api/inspector/inspections?limit=2')
            .set('Cookie', inspectorCookie)
            .expect(200)
        ).body,
      );
      expect(first.items).toHaveLength(2);
      expect(first.items.every((item) => recordIds.includes(item.id))).toBe(
        true,
      );
      expect(first.nextCursor).toBeTruthy();

      const second = inspectorRecordsResponseSchema.parse(
        (
          await request(app.getHttpServer())
            .get(
              `/api/inspector/inspections?limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`,
            )
            .set('Cookie', inspectorCookie)
            .expect(200)
        ).body,
      );
      const remainingRecordIds = recordIds.filter(
        (id) => !first.items.some((item) => item.id === id),
      );
      expect(remainingRecordIds).toHaveLength(1);
      expect(
        remainingRecordIds.every((id) =>
          second.items.some((item) => item.id === id),
        ),
      ).toBe(true);
      expect(
        second.items.every(
          (item) => !first.items.some((firstItem) => firstItem.id === item.id),
        ),
      ).toBe(true);
    } finally {
      if (recordIds.length)
        await pool.query(
          'DELETE FROM floorwalk.inspections WHERE id = ANY($1::uuid[])',
          [recordIds],
        );
      await pool.end();
    }
  });

  it('supports chat text, images, access checks, and before/after pagination', async () => {
    const seeded = await request(app.getHttpServer())
      .get(`/api/inspections/${chatInspectionId}/messages`)
      .set('Cookie', supervisorCookie)
      .expect(200);
    const seedPage = chatMessagesResponseSchema.parse(seeded.body);
    expect(seedPage.messages).toHaveLength(2);
    expect(seedPage.messages[0].body).toBeTruthy();
    expect(seedPage.messages[1].imageUrl).toBeTruthy();
    const storeInspectorPage = await request(app.getHttpServer())
      .get(`/api/inspections/${chatInspectionId}/messages`)
      .set('Cookie', nb002InspectorCookie)
      .expect(200);
    expect(
      chatMessagesResponseSchema.parse(storeInspectorPage.body).messages,
    ).toHaveLength(2);

    await request(app.getHttpServer())
      .get(`/api/inspections/${chatInspectionId}/messages`)
      .set('Cookie', inspectorCookie)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/inspections/${inspectionId}/messages`)
      .set('Cookie', hqCookie)
      .field('text', '总部不能发言')
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/inspections/${chatInspectionId}/messages`)
      .set('Cookie', inspectorCookie)
      .field('text', '外店不能发言')
      .expect(403);

    const textResponse = await request(app.getHttpServer())
      .post(`/api/inspections/${inspectionId}/messages`)
      .set('Cookie', inspectorCookie)
      .field('text', '已结束的巡检单仍可留言。')
      .expect(201);
    const textMessage = chatMessageSchema.parse(textResponse.body);
    createdChatMessageIds.push(textMessage.id);

    const image = Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAgBAQABPxB//9oADAMBAAIAAwAAABAf/9k=',
      'base64',
    );
    const imageResponse = await request(app.getHttpServer())
      .post(`/api/inspections/${inspectionId}/messages`)
      .set('Cookie', supervisorCookie)
      .field('text', '这是补充照片。')
      .attach('file', image, {
        filename: 'chat.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);
    const imageMessage = chatMessageSchema.parse(imageResponse.body);
    createdChatMessageIds.push(imageMessage.id);
    expect(imageMessage.imageUrl).toBeTruthy();
    const storageKey = decodeURIComponent(
      new URL(imageMessage.imageUrl!).pathname.replace('/storage/', ''),
    );
    createdChatStorageKeys.push(storageKey);

    const imageUrl = await request(app.getHttpServer())
      .get(`/api/messages/${imageMessage.id}/image-url`)
      .set('Cookie', hqCookie)
      .expect(200);
    const signed = chatImageUrlResponseSchema.parse(imageUrl.body);
    const signedPath = new URL(signed.url);
    await request(app.getHttpServer())
      .get(`${signedPath.pathname}${signedPath.search}`)
      .expect(200)
      .expect('content-type', /image\/jpeg/);

    const latest = await request(app.getHttpServer())
      .get(`/api/inspections/${inspectionId}/messages?limit=50`)
      .set('Cookie', inspectorCookie)
      .expect(200);
    const latestPage = chatMessagesResponseSchema.parse(latest.body);
    expect(latestPage.messages.slice(-2).map((message) => message.id)).toEqual([
      textMessage.id,
      imageMessage.id,
    ]);
    expect(latestPage.hasMoreBefore).toBe(false);

    const after = await request(app.getHttpServer())
      .get(`/api/inspections/${inspectionId}/messages?after=${textMessage.seq}`)
      .set('Cookie', inspectorCookie)
      .expect(200);
    expect(chatMessagesResponseSchema.parse(after.body).messages[0].id).toBe(
      imageMessage.id,
    );
    expect(chatMessagesResponseSchema.parse(after.body).hasMoreBefore).toBe(
      true,
    );

    const before = await request(app.getHttpServer())
      .get(
        `/api/inspections/${inspectionId}/messages?before=${imageMessage.seq}`,
      )
      .set('Cookie', inspectorCookie)
      .expect(200);
    expect(
      chatMessagesResponseSchema.parse(before.body).messages.at(-1)?.id,
    ).toBe(textMessage.id);
    await request(app.getHttpServer())
      .get(
        `/api/inspections/${inspectionId}/messages?after=${textMessage.seq}&before=${imageMessage.seq}`,
      )
      .set('Cookie', inspectorCookie)
      .expect(400)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('VALIDATION_FAILED'),
      );

    let lastBulkMessageId = '';
    for (let index = 0; index < 50; index += 1) {
      const response = await request(app.getHttpServer())
        .post(`/api/inspections/${inspectionId}/messages`)
        .set('Cookie', inspectorCookie)
        .field('text', `分页测试 ${index + 1}`)
        .expect(201);
      const message = chatMessageSchema.parse(response.body);
      createdChatMessageIds.push(message.id);
      lastBulkMessageId = message.id;
    }
    const recent = await request(app.getHttpServer())
      .get(`/api/inspections/${inspectionId}/messages`)
      .set('Cookie', inspectorCookie)
      .expect(200);
    const recentPage = chatMessagesResponseSchema.parse(recent.body);
    expect(recentPage.messages).toHaveLength(50);
    expect(recentPage.hasMoreBefore).toBe(true);
    expect(recentPage.messages.at(-1)?.id).toBe(lastBulkMessageId);

    const imageBySeed = await request(app.getHttpServer())
      .get(`/api/messages/${chatImageMessageId}/image-url`)
      .set('Cookie', supervisorCookie)
      .expect(200);
    chatImageUrlResponseSchema.parse(imageBySeed.body);
  });

  it('keeps API connections within the default pool limit under concurrent requests', async () => {
    const monitorPool = createPool();
    let peakConnections = 0;
    try {
      const { rows: pidRows } = await monitorPool.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      const monitorPid = pidRows[0].pid;
      let completed = 0;
      const requests = Array.from({ length: 50 }, (_, index) => {
        const path =
          index < 25 ? '/api/me' : `/api/inspections/${inspectionId}`;
        return request(app.getHttpServer())
          .get(path)
          .set('Cookie', inspectorCookie)
          .then((response) => response.status)
          .finally(() => {
            completed += 1;
          });
      });

      while (completed < requests.length) {
        const { rows } = await monitorPool.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM pg_stat_activity
           WHERE datname = current_database() AND pid <> $1
             AND application_name = 'floorwalk-api'`,
          [monitorPid],
        );
        peakConnections = Math.max(peakConnections, Number(rows[0].count));
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      const statuses = await Promise.all(requests);
      const { rows } = await monitorPool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM pg_stat_activity
         WHERE datname = current_database() AND pid <> $1
           AND application_name = 'floorwalk-api'`,
        [monitorPid],
      );
      peakConnections = Math.max(peakConnections, Number(rows[0].count));

      console.info(`AC-04 peak API connections: ${peakConnections}`);
      expect(statuses).toEqual(Array(50).fill(200));
      expect(peakConnections).toBeLessThanOrEqual(10);
    } finally {
      await monitorPool.end();
    }
  }, 60000);

  it('creates an independent database pool for each Nest application instance', async () => {
    const secondModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const secondApp =
      secondModule.createNestApplication<NestExpressApplication>();
    await secondApp.init();
    try {
      expect(secondApp.get(DATABASE_POOL)).not.toBe(app.get(DATABASE_POOL));
    } finally {
      await secondApp.close();
    }
  });

  it('exposes every contracted endpoint with its response schema', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({
        email: 'inspector@northbean.example',
        password: 'northbean-demo',
      })
      .expect(201);
    const me = await request(app.getHttpServer())
      .get('/api/me')
      .set('Cookie', inspectorCookie)
      .expect(200);
    const today = await request(app.getHttpServer())
      .get('/api/inspector/today')
      .set('Cookie', inspectorCookie)
      .expect(200);
    const todayBody = todayResponseSchema.parse(today.body);
    expect(todayBody.site.code).toBe('NB-001');
    expect(todayBody.submittedToday).toBe(false);
    const seededDetail = await request(app.getHttpServer())
      .get(`/api/inspections/${inspectionId}`)
      .set('Cookie', inspectorCookie)
      .expect(200);
    const seededDetailBody = inspectionDetailSchema.parse(seededDetail.body);
    expect(seededDetailBody.reviews.length).toBeGreaterThan(0);
    expect(seededDetailBody.reviews).toEqual(
      [...seededDetailBody.reviews].sort(
        (left, right) =>
          Date.parse(left.createdAt) - Date.parse(right.createdAt),
      ),
    );
    const seedSigned = await request(app.getHttpServer())
      .get(`/api/evidence/${seedEvidenceId}`)
      .set('Cookie', inspectorCookie)
      .expect(200);
    const seedSignedBody = signedEvidenceResponseSchema.parse(seedSigned.body);
    const seedPhotoUrl = new URL(seedSignedBody.url);
    const seedPhoto = await request(app.getHttpServer())
      .get(`${seedPhotoUrl.pathname}${seedPhotoUrl.search}`)
      .expect(200);
    expect(seedPhoto.body.byteLength).toBeGreaterThan(0);
    const invalidSignatureUrl = new URL(seedSignedBody.url);
    invalidSignatureUrl.searchParams.set('signature', '0'.repeat(64));
    await request(app.getHttpServer())
      .get(`${invalidSignatureUrl.pathname}${invalidSignatureUrl.search}`)
      .expect(403)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('FORBIDDEN'),
      );
    const expiredSignatureUrl = new URL(seedSignedBody.url);
    expiredSignatureUrl.searchParams.set('expires', '0');
    await request(app.getHttpServer())
      .get(`${expiredSignatureUrl.pathname}${expiredSignatureUrl.search}`)
      .expect(403)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('FORBIDDEN'),
      );
    await request(app.getHttpServer())
      .get('/storage/..%2Foutside.jpg')
      .expect(400)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('VALIDATION_FAILED'),
      );
    const created = await request(app.getHttpServer())
      .post('/api/inspections')
      .set('Cookie', inspectorCookie)
      .send({ templateId })
      .expect(201);
    createdInspectionId = inspectionSchema.parse(created.body).id;

    const shanghaiParts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(new Date())
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );
    const shanghaiMidnight = new Date(
      Date.UTC(shanghaiParts.year, shanghaiParts.month - 1, shanghaiParts.day) -
        8 * 60 * 60 * 1000,
    );
    const boundaryPool = createPool();
    try {
      await boundaryPool.query(
        'UPDATE floorwalk.inspections SET submitted_at = $1 WHERE id = $2',
        [new Date(shanghaiMidnight.getTime() - 1), createdInspectionId],
      );
    } finally {
      await boundaryPool.end();
    }
    const beforeShanghaiDay = await request(app.getHttpServer())
      .get('/api/inspector/today')
      .set('Cookie', inspectorCookie)
      .expect(200);
    expect(
      todayResponseSchema.parse(beforeShanghaiDay.body).submittedToday,
    ).toBe(false);
    const insideDayPool = createPool();
    try {
      await insideDayPool.query(
        'UPDATE floorwalk.inspections SET submitted_at = $1 WHERE id = $2',
        [
          new Date(shanghaiMidnight.getTime() + 60 * 60 * 1000),
          createdInspectionId,
        ],
      );
    } finally {
      await insideDayPool.end();
    }
    const insideShanghaiDay = await request(app.getHttpServer())
      .get('/api/inspector/today')
      .set('Cookie', inspectorCookie)
      .expect(200);
    expect(
      todayResponseSchema.parse(insideShanghaiDay.body).submittedToday,
    ).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/api/inspections/${createdInspectionId}`)
      .set('Cookie', inspectorCookie)
      .expect(200);
    const detailBody = inspectionDetailSchema.parse(detail.body);
    expect(detailBody.site.code).toBe('NB-001');
    expect(detailBody.reviews).toEqual(
      [...detailBody.reviews].sort(
        (left, right) =>
          Date.parse(left.createdAt) - Date.parse(right.createdAt),
      ),
    );
    const createdItemId = detail.body.items[0].id as string;
    await request(app.getHttpServer())
      .post(`/api/inspections/${createdInspectionId}/submit`)
      .set('Cookie', inspectorCookie)
      .expect(422)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('INCOMPLETE'),
      );
    const updated = await request(app.getHttpServer())
      .patch(`/api/inspections/${createdInspectionId}/items/${createdItemId}`)
      .set('Cookie', inspectorCookie)
      .send({ result: 'pass' })
      .expect(200);
    updateInspectionItemResponseSchema.parse(updated.body);

    const evidence = await request(app.getHttpServer())
      .post(
        `/api/inspections/${createdInspectionId}/items/${createdItemId}/evidence`,
      )
      .set('Cookie', inspectorCookie)
      .attach('file', Buffer.from('contract-test'), {
        filename: 'contract.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);
    const createdEvidence = evidenceSchema.parse(evidence.body);
    createdEvidenceId = createdEvidence.id;
    createdEvidenceStorageKey = createdEvidence.storageKey;
    const signed = await request(app.getHttpServer())
      .get(`/api/evidence/${createdEvidenceId}`)
      .set('Cookie', inspectorCookie)
      .expect(200);
    signedEvidenceResponseSchema.parse(signed.body);

    await request(app.getHttpServer())
      .post(
        `/api/inspections/${createdInspectionId}/items/${createdItemId}/evidence`,
      )
      .set('Cookie', inspectorCookie)
      .attach('file', Buffer.from('invalid-mime'), {
        filename: 'contract.gif',
        contentType: 'image/gif',
      })
      .expect(400)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('VALIDATION_FAILED'),
      );
    await request(app.getHttpServer())
      .post(
        `/api/inspections/${createdInspectionId}/items/${createdItemId}/evidence`,
      )
      .set('Cookie', inspectorCookie)
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), {
        filename: 'too-large.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('VALIDATION_FAILED'),
      );

    const skippedPhotoItem = detailBody.items.find(
      (item) => item.photoRequired && item.id !== createdItemId,
    );
    for (const item of detailBody.items.slice(1)) {
      await request(app.getHttpServer())
        .patch(`/api/inspections/${createdInspectionId}/items/${item.id}`)
        .set('Cookie', inspectorCookie)
        .send({ result: 'pass' })
        .expect(200);
      if (item.photoRequired && item.id !== skippedPhotoItem?.id)
        await request(app.getHttpServer())
          .post(
            `/api/inspections/${createdInspectionId}/items/${item.id}/evidence`,
          )
          .set('Cookie', inspectorCookie)
          .attach('file', Buffer.from('contract-test'), {
            filename: `${item.id}.jpg`,
            contentType: 'image/jpeg',
          })
          .expect(201);
    }

    expect(skippedPhotoItem).toBeDefined();
    await request(app.getHttpServer())
      .post(`/api/inspections/${createdInspectionId}/submit`)
      .set('Cookie', inspectorCookie)
      .expect(422)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('INCOMPLETE'),
      );
    await request(app.getHttpServer())
      .post(
        `/api/inspections/${createdInspectionId}/items/${skippedPhotoItem!.id}/evidence`,
      )
      .set('Cookie', inspectorCookie)
      .attach('file', Buffer.from('contract-test'), {
        filename: `${skippedPhotoItem!.id}.jpg`,
        contentType: 'image/jpeg',
      })
      .expect(201);

    const submitted = await request(app.getHttpServer())
      .post(`/api/inspections/${createdInspectionId}/submit`)
      .set('Cookie', inspectorCookie)
      .expect(201);
    submitInspectionResponseSchema.parse(submitted.body);
    const afterSubmitToday = await request(app.getHttpServer())
      .get('/api/inspector/today')
      .set('Cookie', inspectorCookie)
      .expect(200);
    expect(
      todayResponseSchema.parse(afterSubmitToday.body).submittedToday,
    ).toBe(true);
    const queue = await request(app.getHttpServer())
      .get('/api/review/queue')
      .set('Cookie', supervisorCookie)
      .expect(200);
    const queueBody = reviewQueueResponseSchema.parse(queue.body);
    expect(queueBody.every((entry) => entry.site.code)).toBe(true);
    expect(queueBody.some((entry) => entry.id === createdInspectionId)).toBe(
      true,
    );
    const reviewed = await request(app.getHttpServer())
      .post(`/api/inspections/${createdInspectionId}/review`)
      .set('Cookie', supervisorCookie)
      .send({ action: 'start' })
      .expect(201);
    reviewResponseSchema.parse(reviewed.body);
    await request(app.getHttpServer())
      .post(`/api/inspections/${createdInspectionId}/review`)
      .set('Cookie', supervisorCookie)
      .send({
        action: 'rework',
        reworkItemIds: ['00000000-0000-4000-8000-000000000000'],
      })
      .expect(400)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('VALIDATION_FAILED'),
      );
    await request(app.getHttpServer())
      .post(`/api/inspections/${createdInspectionId}/review`)
      .set('Cookie', supervisorCookie)
      .send({ action: 'approve' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/inspections/${createdInspectionId}/items/${createdItemId}`)
      .set('Cookie', inspectorCookie)
      .send({ result: 'fail' })
      .expect(409)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('INVALID_STATE'),
      );
    await request(app.getHttpServer())
      .post(
        `/api/inspections/${createdInspectionId}/items/${createdItemId}/evidence`,
      )
      .set('Cookie', inspectorCookie)
      .attach('file', Buffer.from('contract-test'), {
        filename: 'blocked.jpg',
        contentType: 'image/jpeg',
      })
      .expect(409)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('INVALID_STATE'),
      );
    const criticalCreated = await request(app.getHttpServer())
      .post('/api/inspections')
      .set('Cookie', inspectorCookie)
      .send({ templateId })
      .expect(201);
    const criticalInspectionId = inspectionSchema.parse(
      criticalCreated.body,
    ).id;
    const criticalDetail = await request(app.getHttpServer())
      .get(`/api/inspections/${criticalInspectionId}`)
      .set('Cookie', inspectorCookie)
      .expect(200);
    const criticalItems = inspectionDetailSchema.parse(
      criticalDetail.body,
    ).items;
    const criticalItemId = criticalItems[0].id;
    const criticalPool = createPool();
    try {
      await criticalPool.query(
        'UPDATE floorwalk.inspection_items SET critical = true WHERE id = $1',
        [criticalItemId],
      );
    } finally {
      await criticalPool.end();
    }
    const criticalStorageKeys: string[] = [];
    for (const item of criticalItems) {
      await request(app.getHttpServer())
        .patch(`/api/inspections/${criticalInspectionId}/items/${item.id}`)
        .set('Cookie', inspectorCookie)
        .send({ result: item.id === criticalItemId ? 'fail' : 'pass' })
        .expect(200);
      if (item.photoRequired) {
        const criticalEvidence = await request(app.getHttpServer())
          .post(
            `/api/inspections/${criticalInspectionId}/items/${item.id}/evidence`,
          )
          .set('Cookie', inspectorCookie)
          .attach('file', Buffer.from('critical-test'), {
            filename: `${item.id}.jpg`,
            contentType: 'image/jpeg',
          })
          .expect(201);
        criticalStorageKeys.push(
          evidenceSchema.parse(criticalEvidence.body).storageKey,
        );
      }
    }
    await request(app.getHttpServer())
      .post(`/api/inspections/${criticalInspectionId}/submit`)
      .set('Cookie', inspectorCookie)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/inspections/${criticalInspectionId}/review`)
      .set('Cookie', supervisorCookie)
      .send({ action: 'start' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/inspections/${criticalInspectionId}/review`)
      .set('Cookie', supervisorCookie)
      .send({ action: 'approve' })
      .expect(422)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('CRITICAL_FAILED'),
      );
    const criticalCleanupPool = createPool();
    try {
      await criticalCleanupPool.query(
        'DELETE FROM floorwalk.evidence WHERE inspection_item_id IN (SELECT id FROM floorwalk.inspection_items WHERE inspection_id = $1)',
        [criticalInspectionId],
      );
      await criticalCleanupPool.query(
        'DELETE FROM floorwalk.reviews WHERE inspection_id = $1',
        [criticalInspectionId],
      );
      await criticalCleanupPool.query(
        'DELETE FROM floorwalk.inspection_items WHERE inspection_id = $1',
        [criticalInspectionId],
      );
      await criticalCleanupPool.query(
        'DELETE FROM floorwalk.inspections WHERE id = $1',
        [criticalInspectionId],
      );
    } finally {
      await criticalCleanupPool.end();
    }
    for (const storageKey of criticalStorageKeys)
      await rm(
        path.resolve(
          process.env.STORAGE_DIR ?? path.join('apps', 'api', '.storage'),
          storageKey,
        ),
        { force: true },
      );
    const dashboard = await request(app.getHttpServer())
      .get('/api/dashboard/sites')
      .set('Cookie', supervisorCookie)
      .expect(200);
    dashboardSitesResponseSchema.parse(dashboard.body);
    expect(todayBody.template.items).toHaveLength(8);

    const deletedSession = await request(app.getHttpServer())
      .delete('/api/auth/session')
      .expect(204);
    expect(deletedSession.text).toBe('');
    const chatListResponse = await request(app.getHttpServer())
      .get(`/api/inspections/${chatInspectionId}/messages`)
      .set('Cookie', supervisorCookie)
      .expect(200);
    const chatCreateResponse = await request(app.getHttpServer())
      .post(`/api/inspections/${inspectionId}/messages`)
      .set('Cookie', supervisorCookie)
      .field('text', '路由表 schema 验证消息')
      .expect(201);
    createdChatMessageIds.push(
      chatMessageSchema.parse(chatCreateResponse.body).id,
    );
    const chatImageUrlResponse = await request(app.getHttpServer())
      .get(`/api/messages/${chatImageMessageId}/image-url`)
      .set('Cookie', supervisorCookie)
      .expect(200);
    const recordListResponse = await request(app.getHttpServer())
      .get('/api/inspector/inspections')
      .set('Cookie', inspectorCookie)
      .expect(200);
    const adminSiteListResponse = await request(app.getHttpServer())
      .get('/api/admin/sites')
      .set('Cookie', supervisorCookie)
      .expect(200);
    const adminSiteCreateResponse = await request(app.getHttpServer())
      .post('/api/admin/sites')
      .set('Cookie', supervisorCookie)
      .send({ code: 'FW-011-ROUTE', name: '路由表测试门店' })
      .expect(201);
    const adminSiteUpdateResponse = await request(app.getHttpServer())
      .patch(`/api/admin/sites/${adminSiteCreateResponse.body.id}`)
      .set('Cookie', supervisorCookie)
      .send({ active: false })
      .expect(200);
    const adminTemplateListResponse = await request(app.getHttpServer())
      .get('/api/admin/templates')
      .set('Cookie', supervisorCookie)
      .expect(200);
    const adminTemplateCreateResponse = await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', supervisorCookie)
      .send({
        name: 'FW-011 路由表测试模板',
        items: [{ title: '测试项', photoRequired: false, critical: false }],
      })
      .expect(201);
    const adminTemplateUpdateResponse = await request(app.getHttpServer())
      .put(`/api/admin/templates/${adminTemplateCreateResponse.body.id}`)
      .set('Cookie', supervisorCookie)
      .send({
        name: 'FW-011 路由表测试模板更新',
        items: [
          {
            position: 1,
            title: '测试项',
            photoRequired: false,
            critical: false,
          },
        ],
      })
      .expect(200);
    const adminTemplateCurrentResponse = await request(app.getHttpServer())
      .post(
        `/api/admin/templates/${adminTemplateCreateResponse.body.id}/current`,
      )
      .set('Cookie', supervisorCookie)
      .expect(200);
    createdAdminSiteIds.push(adminSiteCreateResponse.body.id);
    createdAdminTemplateIds.push(adminTemplateCreateResponse.body.id);
    const routeResponses = {
      createSession: login,
      deleteSession: deletedSession,
      me,
      today,
      createInspection: created,
      getInspection: detail,
      updateInspectionItem: updated,
      addEvidence: evidence,
      getEvidence: signed,
      submitInspection: submitted,
      reviewQueue: queue,
      reviewInspection: reviewed,
      dashboardSites: dashboard,
      listInspectionMessages: chatListResponse,
      createInspectionMessage: chatCreateResponse,
      getMessageImageUrl: chatImageUrlResponse,
      listInspectorInspections: recordListResponse,
      listAdminSites: adminSiteListResponse,
      createAdminSite: adminSiteCreateResponse,
      updateAdminSite: adminSiteUpdateResponse,
      listAdminTemplates: adminTemplateListResponse,
      createAdminTemplate: adminTemplateCreateResponse,
      updateAdminTemplate: adminTemplateUpdateResponse,
      setCurrentAdminTemplate: adminTemplateCurrentResponse,
    };
    for (const [routeKey, route] of Object.entries(apiRoutes)) {
      const response = routeResponses[routeKey as keyof typeof routeResponses];
      expect(response.status).toBe(route.successStatus);
      route.responseSchema.parse(
        route.successStatus === 204 ? undefined : response.body,
      );
    }
  }, 60000);

  it('normalizes validation, not found, and CORS responses', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({ email: 'invalid' })
      .expect(400)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('VALIDATION_FAILED'),
      );
    await request(app.getHttpServer())
      .get('/api/inspections/00000000-0000-0000-0000-000000000000')
      .set('Cookie', inspectorCookie)
      .expect(404)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('NOT_FOUND'),
      );
    await request(app.getHttpServer())
      .get('/api/inspections/not-a-uuid')
      .set('Cookie', inspectorCookie)
      .expect(400)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('VALIDATION_FAILED'),
      );
    await request(app.getHttpServer())
      .get('/api/me')
      .set('Origin', 'http://127.0.0.1:3019')
      .set('Cookie', inspectorCookie)
      .expect('access-control-allow-origin', 'http://127.0.0.1:3019');
  });
});
