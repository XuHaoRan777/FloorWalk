import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from './app.module.js';
import { HttpErrorFilter } from './http-exception.filter.js';
import { createPool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';
import {
  apiRoutes,
  dashboardSitesResponseSchema,
  evidenceSchema,
  inspectionDetailSchema,
  inspectionSchema,
  loginResponseSchema,
  reviewQueueResponseSchema,
  reviewResponseSchema,
  signedEvidenceResponseSchema,
  submitInspectionResponseSchema,
  todayResponseSchema,
  updateInspectionItemResponseSchema,
  userSchema,
  errorResponseSchema,
  userRoles,
} from '@libs/shared';

describe('inspection contract API', () => {
  let app: NestExpressApplication;
  let inspectorToken: string;
  let supervisorToken: string;
  let hqToken: string;
  let inspectionId: string;
  let otherSiteInspectionId: string;
  let seedEvidenceId: string;
  let templateId: string;
  let createdInspectionId: string | undefined;
  let createdEvidenceId: string | undefined;
  let createdEvidenceStorageKey: string | undefined;

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.enableCors({ origin: ['http://127.0.0.1:3019'] });
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();

    const login = async (email: string) => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'northbean-demo' })
        .expect(201);
      return loginResponseSchema.parse(response.body).token;
    };
    inspectorToken = await login('inspector@northbean.example');
    supervisorToken = await login('supervisor@northbean.example');
    hqToken = await login('hq@northbean.example');

    const pool = createPool();
    try {
      const template = await pool.query<{ id: string }>(
        'SELECT id FROM floorwalk.templates LIMIT 1',
      );
      templateId = template.rows[0].id;
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
      if (createdEvidenceStorageKey) {
        await rm(
          path.resolve(
            process.env.STORAGE_DIR ?? path.join('apps', 'api', '.storage'),
            createdEvidenceStorageKey,
          ),
          { force: true },
        );
      }
    } finally {
      await pool.end();
      await app.close();
    }
  });

  it('publishes the complete route table under /api', () => {
    expect(Object.keys(apiRoutes)).toHaveLength(12);
    for (const route of Object.values(apiRoutes)) {
      expect(route.path.startsWith('/api/')).toBe(true);
      expect(route.responseSchema).toBeDefined();
      expect([200, 201]).toContain(route.successStatus);
    }
  });

  it('authenticates roles and enforces site and role access', async () => {
    const me = await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(200);
    expect(userSchema.parse(me.body).role).toBe('inspector');
    await request(app.getHttpServer())
      .get(`/api/inspections/${otherSiteInspectionId}`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(403)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('FORBIDDEN'),
      );
    await request(app.getHttpServer())
      .get('/api/dashboard/sites')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/inspections/${inspectionId}/review`)
      .set('Authorization', `Bearer ${hqToken}`)
      .send({ action: 'approve' })
      .expect(403);
    await request(app.getHttpServer()).get('/api/me').expect(401);
    const expiredToken = new JwtService({
      secret: process.env.JWT_SECRET,
    }).sign({ id: '00000000-0000-0000-0000-000000000001' }, { expiresIn: -1 });
    await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);

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
              .set('Authorization', `Bearer ${supervisorToken}`);
            return { status: response.status, body: response.body };
          },
          hq: async () => {
            const response = await request(app.getHttpServer())
              .get('/api/inspector/today')
              .set('Authorization', `Bearer ${hqToken}`);
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
              .set('Authorization', `Bearer ${supervisorToken}`)
              .send({ templateId });
            return { status: response.status, body: response.body };
          },
          hq: async () => {
            const response = await request(app.getHttpServer())
              .post('/api/inspections')
              .set('Authorization', `Bearer ${hqToken}`)
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
              .set('Authorization', `Bearer ${supervisorToken}`)
              .send({ result: 'pass' });
            return { status: response.status, body: response.body };
          },
          hq: async () => {
            const response = await request(app.getHttpServer())
              .patch(
                `/api/inspections/${inspectionId}/items/00000000-0000-4000-8000-000000000000`,
              )
              .set('Authorization', `Bearer ${hqToken}`)
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
              .set('Authorization', `Bearer ${supervisorToken}`);
            return { status: response.status, body: response.body };
          },
          hq: async () => {
            const response = await request(app.getHttpServer())
              .post(
                `/api/inspections/${inspectionId}/items/00000000-0000-4000-8000-000000000000/evidence`,
              )
              .set('Authorization', `Bearer ${hqToken}`);
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
              .set('Authorization', `Bearer ${supervisorToken}`);
            return { status: response.status, body: response.body };
          },
          hq: async () => {
            const response = await request(app.getHttpServer())
              .post(`/api/inspections/${inspectionId}/submit`)
              .set('Authorization', `Bearer ${hqToken}`);
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
              .set('Authorization', `Bearer ${inspectorToken}`);
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
              .set('Authorization', `Bearer ${inspectorToken}`)
              .send({ action: 'approve' });
            return { status: response.status, body: response.body };
          },
          hq: async () => {
            const response = await request(app.getHttpServer())
              .post(`/api/inspections/${inspectionId}/review`)
              .set('Authorization', `Bearer ${hqToken}`)
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
              .set('Authorization', `Bearer ${inspectorToken}`);
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

  it('exposes every contracted endpoint with its response schema', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'inspector@northbean.example',
        password: 'northbean-demo',
      })
      .expect(201);
    const me = await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(200);
    const today = await request(app.getHttpServer())
      .get('/api/inspector/today')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(200);
    const todayBody = todayResponseSchema.parse(today.body);
    expect(todayBody.site.code).toBe('NB-001');
    expect(todayBody.submittedToday).toBe(false);
    const seededDetail = await request(app.getHttpServer())
      .get(`/api/inspections/${inspectionId}`)
      .set('Authorization', `Bearer ${inspectorToken}`)
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
      .set('Authorization', `Bearer ${inspectorToken}`)
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
      .set('Authorization', `Bearer ${inspectorToken}`)
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
      .set('Authorization', `Bearer ${inspectorToken}`)
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
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(200);
    expect(
      todayResponseSchema.parse(insideShanghaiDay.body).submittedToday,
    ).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/api/inspections/${createdInspectionId}`)
      .set('Authorization', `Bearer ${inspectorToken}`)
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
    const updated = await request(app.getHttpServer())
      .patch(`/api/inspections/${createdInspectionId}/items/${createdItemId}`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ result: 'pass' })
      .expect(200);
    updateInspectionItemResponseSchema.parse(updated.body);

    const evidence = await request(app.getHttpServer())
      .post(
        `/api/inspections/${createdInspectionId}/items/${createdItemId}/evidence`,
      )
      .set('Authorization', `Bearer ${inspectorToken}`)
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
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(200);
    signedEvidenceResponseSchema.parse(signed.body);

    for (const item of detailBody.items.slice(1)) {
      await request(app.getHttpServer())
        .patch(`/api/inspections/${createdInspectionId}/items/${item.id}`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ result: 'pass' })
        .expect(200);
      if (item.photoRequired)
        await request(app.getHttpServer())
          .post(
            `/api/inspections/${createdInspectionId}/items/${item.id}/evidence`,
          )
          .set('Authorization', `Bearer ${inspectorToken}`)
          .attach('file', Buffer.from('contract-test'), {
            filename: `${item.id}.jpg`,
            contentType: 'image/jpeg',
          })
          .expect(201);
    }

    const submitted = await request(app.getHttpServer())
      .post(`/api/inspections/${createdInspectionId}/submit`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(201);
    submitInspectionResponseSchema.parse(submitted.body);
    const afterSubmitToday = await request(app.getHttpServer())
      .get('/api/inspector/today')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(200);
    expect(
      todayResponseSchema.parse(afterSubmitToday.body).submittedToday,
    ).toBe(true);
    const queue = await request(app.getHttpServer())
      .get('/api/review/queue')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    const queueBody = reviewQueueResponseSchema.parse(queue.body);
    expect(queueBody.every((entry) => entry.site.code)).toBe(true);
    expect(queueBody.some((entry) => entry.id === createdInspectionId)).toBe(
      true,
    );
    const reviewed = await request(app.getHttpServer())
      .post(`/api/inspections/${createdInspectionId}/review`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ action: 'start' })
      .expect(201);
    reviewResponseSchema.parse(reviewed.body);
    await request(app.getHttpServer())
      .post(`/api/inspections/${createdInspectionId}/review`)
      .set('Authorization', `Bearer ${supervisorToken}`)
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
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ action: 'approve' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/inspections/${createdInspectionId}/items/${createdItemId}`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ result: 'fail' })
      .expect(409)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('INVALID_STATE'),
      );
    await request(app.getHttpServer())
      .post(
        `/api/inspections/${createdInspectionId}/items/${createdItemId}/evidence`,
      )
      .set('Authorization', `Bearer ${inspectorToken}`)
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
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ templateId })
      .expect(201);
    const criticalInspectionId = inspectionSchema.parse(
      criticalCreated.body,
    ).id;
    const criticalDetail = await request(app.getHttpServer())
      .get(`/api/inspections/${criticalInspectionId}`)
      .set('Authorization', `Bearer ${inspectorToken}`)
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
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ result: item.id === criticalItemId ? 'fail' : 'pass' })
        .expect(200);
      if (item.photoRequired) {
        const criticalEvidence = await request(app.getHttpServer())
          .post(
            `/api/inspections/${criticalInspectionId}/items/${item.id}/evidence`,
          )
          .set('Authorization', `Bearer ${inspectorToken}`)
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
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/inspections/${criticalInspectionId}/review`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ action: 'start' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/inspections/${criticalInspectionId}/review`)
      .set('Authorization', `Bearer ${supervisorToken}`)
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
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    dashboardSitesResponseSchema.parse(dashboard.body);
    expect(todayBody.template.items).toHaveLength(8);

    const routeResponses = {
      login,
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
    };
    for (const [routeKey, route] of Object.entries(apiRoutes)) {
      const response = routeResponses[routeKey as keyof typeof routeResponses];
      expect(response.status).toBe(route.successStatus);
      route.responseSchema.parse(response.body);
    }
  }, 60000);

  it('normalizes validation, not found, and CORS responses', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'invalid' })
      .expect(400)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('VALIDATION_FAILED'),
      );
    await request(app.getHttpServer())
      .get('/api/inspections/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(404)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('NOT_FOUND'),
      );
    await request(app.getHttpServer())
      .get('/api/inspections/not-a-uuid')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(400)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('VALIDATION_FAILED'),
      );
    await request(app.getHttpServer())
      .get('/api/me')
      .set('Origin', 'http://127.0.0.1:3019')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect('access-control-allow-origin', 'http://127.0.0.1:3019');
  });
});
