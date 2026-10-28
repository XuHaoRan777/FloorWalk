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
  let inspectorCookie: string;
  let supervisorCookie: string;
  let hqCookie: string;
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
    expect(Object.keys(apiRoutes)).toHaveLength(13);
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
