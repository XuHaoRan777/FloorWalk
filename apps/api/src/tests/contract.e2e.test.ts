import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../app.module.js';
import { DATABASE_POOL } from '../db/pool.provider.js';
import { HttpErrorFilter } from '../filters/http-exception.filter.js';
import { createPool } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { seedDatabase } from '../db/seed.js';
import { clearFakeMailbox } from '../email/fake.js';
import { TaskSchedulerService } from '../services/task-scheduler.js';
import {
  apiRoutes,
  adminSitesResponseSchema,
  adminTemplatesResponseSchema,
  chatMessageSchema,
  chatMessagesResponseSchema,
  dashboardSitesResponseSchema,
  inspectionDetailSchema,
  inspectorRecordsResponseSchema,
  loginResponseSchema,
  siteResponseSchema,
  signedEvidenceResponseSchema,
  chatImageUrlResponseSchema,
  taskItemUploadResponseSchema,
  taskReviewQueueResponseSchema,
  taskReviewSchema,
  todayResponseSchema,
  templateResponseSchema,
  userSchema,
  errorResponseSchema,
  userRoles,
} from '@libs/shared';

const protocolRouteBodies = {
  createOrg: {
    orgName: 'Protocol organization',
    adminName: 'Protocol admin',
    email: 'protocol@example.test',
    password: 'protocol-password',
  },
  listAdminUsers: undefined,
  createAdminUser: {
    loginName: 'protocol@example.test',
    displayName: 'Protocol user',
    role: 'store_manager',
    password: 'protocol-password',
  },
  updateAdminUser: { displayName: 'Protocol user' },
  resetAdminUserPassword: { password: 'protocol-password' },
  changePassword: {
    currentPassword: 'wrong-password',
    newPassword: 'protocol-password',
  },
} as const;

// L1 permission expectation table; account operations have focused tests in users.test.ts.
// Scope / operation                                    Status  Error code
// Cross-organization resource (all protected resources) 404     NOT_FOUND
// Store manager accesses account administration        403     FORBIDDEN
// Disable the final active admin                       409     INVALID_STATE
// Login with a disabled account                        401     UNAUTHENTICATED
// mustChangePassword: protected route other than
// me / changePassword / deleteSession                  403     FORBIDDEN

describe('inspection contract API', () => {
  let app: NestExpressApplication;
  let inspectorCookie: string;
  let hqCookie: string;
  let inspectionId: string;
  let inspectionTaskId: string;
  let northbeanSiteId: string;
  let otherSiteInspectionId: string;
  let seedEvidenceId: string;
  let templateId: string;
  let chatInspectionId: string;
  let chatImageMessageId: string;
  let nb002InspectorCookie: string;
  let demo2InspectorCookie: string;
  let demo2AdminCookie: string;
  let createdInspectionId: string | undefined;
  let createdTaskId: string | undefined;
  const createdEvidenceStorageKeys: string[] = [];
  const createdChatMessageIds: string[] = [];
  const createdAdminSiteIds: string[] = [];
  const createdProtocolOrgIds: string[] = [];
  const createdProtocolEmails: string[] = [];
  const createdAdminTemplateIds: string[] = [];
  const createdScheduleIds: string[] = [];
  const createdAiStandardIds: string[] = [];
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

    const login = async (loginName: string, organization = 'Northbean') => {
      let response = await request(app.getHttpServer())
        .post('/api/auth/session')
        .send({ loginName, password: 'northbean-demo' })
        .expect(201);
      if (response.body.organizations) {
        const orgId = response.body.organizations.find(
          (org: { name: string }) => org.name === organization,
        )?.id;
        expect(orgId).toBeDefined();
        response = await request(app.getHttpServer())
          .post('/api/auth/session')
          .send({ loginName, password: 'northbean-demo', orgId })
          .expect(201);
      }
      loginResponseSchema.parse(response.body);
      return (response.headers['set-cookie'] as unknown as string[])[0].split(
        ';',
      )[0];
    };
    inspectorCookie = await login('inspector@northbean.example');
    nb002InspectorCookie = await login('inspector+nb-002@northbean.example');
    hqCookie = await login('hq@northbean.example');
    demo2InspectorCookie = await login(
      'inspector@northbean.example',
      '演示二号',
    );
    demo2AdminCookie = await login('admin@demo2.example');

    const pool = createPool();
    try {
      const template = await pool.query<{ id: string }>(
        `SELECT t.id FROM floorwalk.templates t
         JOIN floorwalk.organizations o ON o.id = t.org_id
         WHERE o.name = 'Northbean' AND t.name = '开店检查'`,
      );
      templateId = template.rows[0].id;
      const northbeanSite = await pool.query<{ id: string }>(
        "SELECT id FROM floorwalk.sites WHERE code = 'NB-001'",
      );
      northbeanSiteId = northbeanSite.rows[0].id;
      const chatInspection = await pool.query<{ id: string }>(
        `SELECT i.id FROM floorwalk.inspections i
         JOIN floorwalk.sites s ON s.id = i.site_id
         JOIN floorwalk.chat_messages message ON message.inspection_id = i.id
         WHERE s.code = 'NB-002' AND message.storage_key IS NOT NULL
         ORDER BY i.created_at DESC LIMIT 1`,
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
      inspectionTaskId = (
        await pool.query<{ taskId: string }>(
          'SELECT task_id AS "taskId" FROM floorwalk.inspections WHERE id = $1',
          [inspectionId],
        )
      ).rows[0].taskId;
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
      let inspectionToClean = createdInspectionId;
      if (!inspectionToClean && createdTaskId) {
        const inspection = await pool.query<{ id: string }>(
          'SELECT id FROM floorwalk.inspections WHERE task_id = $1',
          [createdTaskId],
        );
        inspectionToClean = inspection.rows[0]?.id;
      }
      if (inspectionToClean) {
        await pool.query(
          'DELETE FROM floorwalk.chat_messages WHERE inspection_id = $1',
          [inspectionToClean],
        );
        await pool.query(
          'DELETE FROM floorwalk.inspection_participants WHERE inspection_id = $1',
          [inspectionToClean],
        );
        await pool.query(
          `DELETE FROM floorwalk.inspection_item_decisions
           WHERE inspection_item_id IN
             (SELECT id FROM floorwalk.inspection_items WHERE inspection_id = $1)`,
          [inspectionToClean],
        );
        await pool.query(
          `DELETE FROM floorwalk.evidence WHERE inspection_item_id IN
           (SELECT id FROM floorwalk.inspection_items WHERE inspection_id = $1)`,
          [inspectionToClean],
        );
        await pool.query(
          'DELETE FROM floorwalk.inspection_items WHERE inspection_id = $1',
          [inspectionToClean],
        );
        await pool.query(
          'DELETE FROM floorwalk.reviews WHERE inspection_id = $1',
          [inspectionToClean],
        );
        await pool.query('DELETE FROM floorwalk.inspections WHERE id = $1', [
          inspectionToClean,
        ]);
      }
      if (createdTaskId)
        await pool.query(
          'DELETE FROM floorwalk.inspection_tasks WHERE id = $1',
          [createdTaskId],
        );
      if (createdChatMessageIds.length)
        await pool.query(
          'DELETE FROM floorwalk.chat_messages WHERE id = ANY($1::uuid[])',
          [createdChatMessageIds],
        );
      const cleanup = await pool.connect();
      try {
        await cleanup.query('BEGIN');
        await cleanup.query(
          'DELETE FROM floorwalk.site_schedules WHERE site_id = ANY($1::uuid[])',
          [createdAdminSiteIds],
        );
        await cleanup.query(
          'DELETE FROM floorwalk.schedules WHERE id = ANY($1::uuid[])',
          [createdScheduleIds],
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
          'DELETE FROM floorwalk.ai_review_standards WHERE id = ANY($1::uuid[])',
          [createdAiStandardIds],
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
      await pool.query(
        'DELETE FROM floorwalk.email_verifications WHERE email = ANY($1::text[])',
        [createdProtocolEmails],
      );
      const orgCleanup = await pool.connect();
      try {
        await orgCleanup.query('BEGIN');
        await orgCleanup.query(
          'DELETE FROM floorwalk.users WHERE org_id = ANY($1::uuid[])',
          [createdProtocolOrgIds],
        );
        await orgCleanup.query(
          'DELETE FROM floorwalk.organizations WHERE id = ANY($1::uuid[])',
          [createdProtocolOrgIds],
        );
        await orgCleanup.query('COMMIT');
      } catch (error) {
        await orgCleanup.query('ROLLBACK');
        throw error;
      } finally {
        orgCleanup.release();
      }
      for (const storageKey of createdEvidenceStorageKeys) {
        await rm(
          path.resolve(
            process.env.STORAGE_DIR ?? path.join('apps', 'api', '.storage'),
            storageKey,
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
      clearFakeMailbox();
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

  const protocolRequest = async (
    routeKey: keyof typeof protocolRouteBodies,
    cookie?: string,
  ) => {
    const route = apiRoutes[routeKey];
    const pathname = route.path.replace(
      ':id',
      '00000000-0000-4000-8000-000000000000',
    );
    const pending = request(app.getHttpServer())[
      route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch'
    ](pathname);
    if (cookie) pending.set('Cookie', cookie);
    const body = protocolRouteBodies[routeKey];
    if (body) {
      if (routeKey === 'createOrg') {
        const email = `protocol-${randomUUID()}@example.test`;
        createdProtocolEmails.push(email);
        await request(app.getHttpServer())
          .post('/api/auth/registration-code')
          .send({ email })
          .expect(201);
        const mailbox = await request(app.getHttpServer())
          .get('/api/testing/mailbox')
          .query({ recipient: email })
          .expect(200);
        pending.send({ ...body, email, verificationCode: mailbox.body.code });
      } else {
        pending.send(body);
      }
    }
    return await pending;
  };

  it('allows every declared role on protocol routes and rejects anonymous protected access', async () => {
    expect(Object.keys(protocolRouteBodies)).toHaveLength(6);
    const cookies = {
      store_manager: inspectorCookie,
      admin: hqCookie,
    };
    for (const routeKey of Object.keys(protocolRouteBodies) as Array<
      keyof typeof protocolRouteBodies
    >) {
      const route = apiRoutes[routeKey];
      const publicRoute = route.roles.length === 0;
      const anonymous = await protocolRequest(routeKey);
      expect(anonymous.status, `${routeKey} anonymous`).toBe(
        publicRoute ? route.successStatus : 401,
      );
      if (routeKey === 'createOrg') {
        route.responseSchema.parse(anonymous.body);
        createdProtocolOrgIds.push(anonymous.body.org.id);
      }
      if (!publicRoute)
        expect(errorResponseSchema.parse(anonymous.body).code).toBe(
          'UNAUTHENTICATED',
        );
      for (const role of userRoles) {
        if (!publicRoute && !(route.roles as readonly string[]).includes(role))
          continue;
        const response = await protocolRequest(routeKey, cookies[role]);
        expect(response.status, `${routeKey} allowed for ${role}`).toBe(
          routeKey === 'createOrg' || routeKey === 'listAdminUsers'
            ? route.successStatus
            : routeKey === 'createAdminUser'
              ? 400
              : routeKey === 'updateAdminUser' ||
                  routeKey === 'resetAdminUserPassword'
                ? 404
                : routeKey === 'changePassword'
                  ? 401
                  : 501,
        );
        if (routeKey === 'createOrg') {
          route.responseSchema.parse(response.body);
          createdProtocolOrgIds.push(response.body.org.id);
        } else if (routeKey === 'listAdminUsers') {
          route.responseSchema.parse(response.body);
        }
        // Empty implemented writes may fail validation after role admission.
      }
    }
  });

  it('publishes the complete route table under /api', () => {
    expect(Object.keys(apiRoutes)).toHaveLength(46);
    for (const route of Object.values(apiRoutes)) {
      expect(route.path.startsWith('/api/')).toBe(true);
      expect(route.responseSchema).toBeDefined();
      expect([200, 201, 204]).toContain(route.successStatus);
    }
  });

  it('returns the current inspection template from the authenticated inspector organization', async () => {
    const today = await request(app.getHttpServer())
      .get('/api/inspector/today')
      .set('Cookie', demo2InspectorCookie)
      .expect(200);
    expect(todayResponseSchema.parse(today.body).templates[0].id).not.toBe(
      templateId,
    );
  });

  it('fails closed when an inspector is bound to another organization site', async () => {
    const pool = createPool();
    const binding = await pool.query<{
      userId: string;
      siteId: string;
      foreignSiteId: string;
    }>(
      `SELECT u.id AS "userId", u.site_id AS "siteId", foreign_site.id AS "foreignSiteId"
       FROM floorwalk.users u
       JOIN floorwalk.sites foreign_site ON foreign_site.org_id <> u.org_id
       WHERE u.login_name = 'inspector@northbean.example' AND foreign_site.code = 'DEMO2-001' AND u.org_id <> foreign_site.org_id LIMIT 1`,
    );
    const { userId, siteId, foreignSiteId } = binding.rows[0];
    try {
      await pool.query(
        'UPDATE floorwalk.users SET site_id = $1 WHERE id = $2',
        [foreignSiteId, userId],
      );
      const inspectionsBefore = await pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM floorwalk.inspections WHERE inspector_id = $1',
        [userId],
      );
      await request(app.getHttpServer())
        .get('/api/inspector/today')
        .set('Cookie', inspectorCookie)
        .expect(404)
        .expect(({ body }) =>
          expect(errorResponseSchema.parse(body).code).toBe('NOT_FOUND'),
        );
      await request(app.getHttpServer())
        .post(`/api/tasks/${inspectionTaskId}/items/1/uploads`)
        .set('Cookie', inspectorCookie)
        .field('selfAssessment', 'pass')
        .field('note', '现场已检查')
        .expect(404)
        .expect(({ body }) =>
          expect(errorResponseSchema.parse(body).code).toBe('NOT_FOUND'),
        );
      const inspectionsAfter = await pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM floorwalk.inspections WHERE inspector_id = $1',
        [userId],
      );
      expect(inspectionsAfter.rows[0].count).toBe(
        inspectionsBefore.rows[0].count,
      );
    } finally {
      await pool.query(
        'UPDATE floorwalk.users SET site_id = $1 WHERE id = $2',
        [siteId, userId],
      );
      await pool.end();
    }
  });

  it('authenticates roles and enforces site and role access', async () => {
    const me = await request(app.getHttpServer())
      .get('/api/me')
      .set('Cookie', inspectorCookie)
      .expect(200);
    expect(userSchema.parse(me.body).role).toBe('store_manager');
    await request(app.getHttpServer())
      .get(`/api/inspections/${otherSiteInspectionId}`)
      .set('Cookie', inspectorCookie)
      .expect(404)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('NOT_FOUND'),
      );
    await request(app.getHttpServer())
      .get('/api/dashboard/sites')
      .set('Cookie', inspectorCookie)
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
        'createInspectionMessage',
        {
          admin: async () => {
            const response = await request(app.getHttpServer())
              .post(`/api/inspections/${inspectionId}/messages`)
              .set('Cookie', hqCookie)
              .field('text', '管理员不可发送');
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'today',
        {
          admin: async () => {
            const response = await request(app.getHttpServer())
              .get('/api/inspector/today')
              .set('Cookie', hqCookie);
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'uploadTaskItem',
        {
          admin: async () => {
            const response = await request(app.getHttpServer())
              .post(`/api/tasks/${inspectionTaskId}/items/1/uploads`)
              .set('Cookie', hqCookie)
              .field('selfAssessment', 'pass')
              .field('note', '现场已检查');
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'getInspectorTask',
        {
          admin: async () => {
            const response = await request(app.getHttpServer())
              .get(`/api/inspector/tasks/${inspectionTaskId}`)
              .set('Cookie', hqCookie);
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'reviewTaskQueue',
        {
          store_manager: async () => {
            const response = await request(app.getHttpServer())
              .get('/api/review/tasks')
              .set('Cookie', inspectorCookie);
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'getTaskReview',
        {
          store_manager: async () => {
            const response = await request(app.getHttpServer())
              .get(`/api/tasks/${inspectionTaskId}/review`)
              .set('Cookie', inspectorCookie);
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'decideTaskItem',
        {
          store_manager: async () => {
            const response = await request(app.getHttpServer())
              .post(
                `/api/tasks/${inspectionTaskId}/items/00000000-0000-4000-8000-000000000000/decision`,
              )
              .set('Cookie', inspectorCookie)
              .send({ result: 'pass' });
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'selfCheckStats',
        {
          store_manager: async () => {
            const response = await request(app.getHttpServer())
              .get('/api/stats/self-check')
              .query({
                scope: 'site',
                id: northbeanSiteId,
                from: '2026-01-01',
                to: '2026-12-31',
              })
              .set('Cookie', inspectorCookie);
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'dashboardSites',
        {
          store_manager: async () => {
            const response = await request(app.getHttpServer())
              .get('/api/dashboard/sites')
              .set('Cookie', inspectorCookie);
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'listInspectorInspections',
        {
          admin: async () => {
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
          store_manager: async () => {
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
          store_manager: async () => {
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
          store_manager: async () => {
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
          store_manager: async () => {
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
          store_manager: async () => {
            const response = await request(app.getHttpServer())
              .post('/api/admin/templates')
              .set('Cookie', inspectorCookie)
              .send({
                name: '测试模板',
                aiEnabled: false,
                items: [
                  {
                    title: '测试项',
                    minPhotoCount: 0,
                    acceptanceCriteria: '',
                    critical: false,
                  },
                ],
              });
            return { status: response.status, body: response.body };
          },
        },
      ],
      [
        'updateAdminTemplate',
        {
          store_manager: async () => {
            const response = await request(app.getHttpServer())
              .put(`/api/admin/templates/${templateId}`)
              .set('Cookie', inspectorCookie)
              .send({
                name: '测试模板',
                aiEnabled: false,
                items: [
                  {
                    position: 1,
                    title: '测试项',
                    minPhotoCount: 0,
                    acceptanceCriteria: '',
                    critical: false,
                  },
                ],
              });
            return { status: response.status, body: response.body };
          },
        },
      ],
    ]);
    for (const routeKey of [
      'listAdminAiStandards',
      'createAdminAiStandard',
      'updateAdminAiStandard',
      'deleteAdminAiStandard',
      'quickSetupAdminTemplate',
      'listAdminSchedules',
      'createAdminSchedule',
      'updateAdminSchedule',
      'deleteAdminSchedule',
      'listAdminSiteSchedules',
      'assignAdminSiteSchedule',
      'addAdminSiteScheduleSkips',
      'deleteAdminSiteScheduleSkip',
    ] as const) {
      deniedByRoute.set(routeKey, {
        store_manager: async () => {
          const route = apiRoutes[routeKey];
          const method = route.method.toLowerCase() as
            'get' | 'post' | 'put' | 'delete';
          const agent = request(app.getHttpServer());
          const response = await agent[method](
            route.path.replace(':id', randomUUID()),
          )
            .set('Cookie', inspectorCookie)
            .send({});
          return { status: response.status, body: response.body };
        },
      });
    }
    for (const [routeKey, route] of Object.entries(apiRoutes)) {
      if (route.roles.length === 0) continue;
      for (const role of userRoles) {
        if ((route.roles as readonly string[]).includes(role)) continue;
        const deniedRequest = Object.hasOwn(protocolRouteBodies, routeKey)
          ? () =>
              protocolRequest(
                routeKey as keyof typeof protocolRouteBodies,
                {
                  store_manager: inspectorCookie,
                  admin: hqCookie,
                }[role],
              )
          : deniedByRoute.get(routeKey)?.[role];
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
      .set('Cookie', hqCookie)
      .expect(200);
    const allSites = adminSitesResponseSchema.parse(sites.body);
    expect(allSites.filter((site) => site.code.startsWith('NB-'))).toHaveLength(
      12,
    );
    expect(allSites.filter((site) => site.code === 'DEMO2-001')).toHaveLength(
      0,
    );
    expect(allSites.map((site) => site.code).sort()).toEqual(
      Array.from(
        { length: 12 },
        (_, index) => `NB-${String(index + 1).padStart(3, '0')}`,
      ),
    );

    const createdSite = await request(app.getHttpServer())
      .post('/api/admin/sites')
      .set('Cookie', hqCookie)
      .send({ code: 'FW-011-TEMP', name: '临时门店' })
      .expect(201);
    expect(createdSite.body.active).toBe(true);
    createdAdminSiteIds.push(createdSite.body.id);

    const templates = await request(app.getHttpServer())
      .get('/api/admin/templates')
      .set('Cookie', hqCookie)
      .expect(200);
    expect(adminTemplatesResponseSchema.parse(templates.body)).toHaveLength(1);

    const createdTemplate = await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', hqCookie)
      .send({
        name: 'FW-011 临时模板',
        aiEnabled: false,
        items: [
          {
            title: '测试项',
            minPhotoCount: 0,
            acceptanceCriteria: '',
            critical: false,
          },
        ],
      })
      .expect(201);
    templateResponseSchema.parse(createdTemplate.body);
    createdAdminTemplateIds.push(createdTemplate.body.id);

    const updatedSite = await request(app.getHttpServer())
      .patch(`/api/admin/sites/${createdSite.body.id}`)
      .set('Cookie', hqCookie)
      .send({ active: false })
      .expect(200);
    siteResponseSchema.parse(updatedSite.body);

    const updatedTemplate = await request(app.getHttpServer())
      .put(`/api/admin/templates/${createdTemplate.body.id}`)
      .set('Cookie', hqCookie)
      .send({
        name: '开店检查更新',
        aiEnabled: false,
        items: [
          {
            position: 1,
            title: '测试项',
            minPhotoCount: 0,
            acceptanceCriteria: '',
            critical: false,
          },
        ],
      })
      .expect(200);
    templateResponseSchema.parse(updatedTemplate.body);

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
    await request(app.getHttpServer())
      .put(`/api/admin/templates/${templateId}`)
      .set('Cookie', inspectorCookie)
      .send({
        name: '拒绝',
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
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/inspector/inspections')
      .set('Cookie', hqCookie)
      .expect(403);
  });

  it('keeps dashboard, site, and template administration within the tenant', async () => {
    const dashboard = await request(app.getHttpServer())
      .get('/api/dashboard/sites')
      .set('Cookie', demo2AdminCookie)
      .expect(200);
    const demoDashboard = dashboardSitesResponseSchema.parse(dashboard.body);
    expect(demoDashboard).toHaveLength(1);
    expect(demoDashboard[0].site.code).toBe('DEMO2-001');

    const sites = await request(app.getHttpServer())
      .get('/api/admin/sites')
      .set('Cookie', demo2AdminCookie)
      .expect(200);
    expect(
      adminSitesResponseSchema.parse(sites.body).map((site) => site.code),
    ).toEqual(['DEMO2-001']);

    const templates = await request(app.getHttpServer())
      .get('/api/admin/templates')
      .set('Cookie', demo2AdminCookie)
      .expect(200);
    expect(adminTemplatesResponseSchema.parse(templates.body)).toHaveLength(1);

    await request(app.getHttpServer())
      .patch(`/api/admin/sites/${northbeanSiteId}`)
      .set('Cookie', demo2AdminCookie)
      .send({ name: '不得跨商家修改' })
      .expect(404);
    await request(app.getHttpServer())
      .put(`/api/admin/templates/${templateId}`)
      .set('Cookie', demo2AdminCookie)
      .send({
        name: '不得跨商家修改',
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

    const duplicateSiteCodeAcrossTenants = await request(app.getHttpServer())
      .post('/api/admin/sites')
      .set('Cookie', demo2AdminCookie)
      .send({ code: 'NB-001', name: '演示二号同编码门店' })
      .expect(201);
    createdAdminSiteIds.push(duplicateSiteCodeAcrossTenants.body.id);
    await request(app.getHttpServer())
      .post('/api/admin/sites')
      .set('Cookie', demo2AdminCookie)
      .send({ code: 'NB-001', name: '重复编码门店' })
      .expect(409);

    const northbeanTemplateName = 'FW-018-跨商家同名模板';
    const northbeanTemplate = await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', hqCookie)
      .send({
        name: northbeanTemplateName,
        aiEnabled: false,
        items: [
          {
            title: 'Northbean 项',
            minPhotoCount: 0,
            acceptanceCriteria: '',
            critical: false,
          },
        ],
      })
      .expect(201);
    createdAdminTemplateIds.push(northbeanTemplate.body.id);

    const duplicateTemplateNameAcrossTenants = await request(
      app.getHttpServer(),
    )
      .post('/api/admin/templates')
      .set('Cookie', demo2AdminCookie)
      .send({
        name: northbeanTemplateName,
        aiEnabled: false,
        items: [
          {
            title: '演示项',
            minPhotoCount: 0,
            acceptanceCriteria: '',
            critical: false,
          },
        ],
      })
      .expect(201);
    createdAdminTemplateIds.push(duplicateTemplateNameAcrossTenants.body.id);
    await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', demo2AdminCookie)
      .send({
        name: northbeanTemplateName,
        aiEnabled: false,
        items: [
          {
            title: '重复项',
            minPhotoCount: 0,
            acceptanceCriteria: '',
            critical: false,
          },
        ],
      })
      .expect(409);
  });

  it('hides Northbean inspection, evidence, and chat resources from every demo tenant role', async () => {
    for (const cookie of [demo2InspectorCookie, demo2AdminCookie]) {
      await request(app.getHttpServer())
        .get(`/api/inspections/${inspectionId}`)
        .set('Cookie', cookie)
        .expect(404)
        .expect(({ body }) =>
          expect(errorResponseSchema.parse(body).code).toBe('NOT_FOUND'),
        );
      await request(app.getHttpServer())
        .get(`/api/evidence/${seedEvidenceId}`)
        .set('Cookie', cookie)
        .expect(404)
        .expect(({ body }) =>
          expect(errorResponseSchema.parse(body).code).toBe('NOT_FOUND'),
        );
      await request(app.getHttpServer())
        .get(`/api/inspections/${chatInspectionId}/messages`)
        .set('Cookie', cookie)
        .expect(404)
        .expect(({ body }) =>
          expect(errorResponseSchema.parse(body).code).toBe('NOT_FOUND'),
        );
      await request(app.getHttpServer())
        .get(`/api/messages/${chatImageMessageId}/image-url`)
        .set('Cookie', cookie)
        .expect(404)
        .expect(({ body }) =>
          expect(errorResponseSchema.parse(body).code).toBe('NOT_FOUND'),
        );
    }

    for (const cookie of [demo2InspectorCookie]) {
      await request(app.getHttpServer())
        .post(`/api/tasks/${inspectionTaskId}/items/1/uploads`)
        .set('Cookie', cookie)
        .field('selfAssessment', 'pass')
        .field('note', '跨商家不应上传')
        .attach(
          'files',
          Buffer.from(
            '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAgCAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAgBAQABPxB//9oADAMBAAIAAwAAABAf/9k=',
            'base64',
          ),
          { filename: 'cross-org.jpg', contentType: 'image/jpeg' },
        )
        .expect(404)
        .expect(({ body }) =>
          expect(errorResponseSchema.parse(body).code).toBe('NOT_FOUND'),
        );
      await request(app.getHttpServer())
        .post(`/api/inspections/${chatInspectionId}/messages`)
        .set('Cookie', cookie)
        .field('text', '跨商家消息不应写入')
        .expect(404)
        .expect(({ body }) =>
          expect(errorResponseSchema.parse(body).code).toBe('NOT_FOUND'),
        );
    }
    await request(app.getHttpServer())
      .post(`/api/inspections/${chatInspectionId}/messages`)
      .set('Cookie', demo2AdminCookie)
      .field('text', '跨商家不能发言')
      .expect(403)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('FORBIDDEN'),
      );
    await request(app.getHttpServer())
      .get(`/api/tasks/${inspectionTaskId}/review`)
      .set('Cookie', demo2AdminCookie)
      .expect(404)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('NOT_FOUND'),
      );
    const detail = await request(app.getHttpServer())
      .get(`/api/tasks/${inspectionTaskId}/review`)
      .set('Cookie', hqCookie)
      .expect(200);
    await request(app.getHttpServer())
      .post(
        `/api/tasks/${inspectionTaskId}/items/${detail.body.items[0].id}/decision`,
      )
      .set('Cookie', demo2AdminCookie)
      .send({ result: 'fail' })
      .expect(404)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('NOT_FOUND'),
      );
    for (const [scope, id] of [
      ['site', northbeanSiteId],
      ['manager', detail.body.items[0].uploadedById],
    ]) {
      await request(app.getHttpServer())
        .get('/api/stats/self-check')
        .query({ scope, id, from: '2026-01-01', to: '2026-12-31' })
        .set('Cookie', demo2AdminCookie)
        .expect(404)
        .expect(({ body }) =>
          expect(errorResponseSchema.parse(body).code).toBe('NOT_FOUND'),
        );
    }
    const foreignQueue = await request(app.getHttpServer())
      .get('/api/review/tasks')
      .set('Cookie', demo2AdminCookie)
      .expect(200);
    expect(
      taskReviewQueueResponseSchema
        .parse(foreignQueue.body)
        .some((task) => task.id === inspectionTaskId),
    ).toBe(false);

    await request(app.getHttpServer())
      .post(`/api/tasks/${inspectionTaskId}/items/1/uploads`)
      .set('Cookie', demo2InspectorCookie)
      .field('selfAssessment', 'pass')
      .field('note', '跨商家不应上传')
      .expect(404)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('NOT_FOUND'),
      );
    const records = await request(app.getHttpServer())
      .get('/api/inspector/inspections')
      .set('Cookie', demo2InspectorCookie)
      .expect(200);
    expect(
      inspectorRecordsResponseSchema
        .parse(records.body)
        .items.some((item) => item.id === inspectionId),
    ).toBe(false);
  });

  it('lets admins review any site in their organization', async () => {
    const pool = createPool();
    let unassignedSiteId: string | undefined;
    let unassignedTaskId: string | undefined;
    let unassignedInspectionId: string | undefined;
    try {
      const site = await pool.query<{ id: string }>(
        `INSERT INTO floorwalk.sites (org_id, code, name)
         SELECT org_id, 'FW018-UNASSIGNED', '未指派主管门店'
         FROM floorwalk.users WHERE login_name = 'hq@northbean.example'
         RETURNING id`,
      );
      unassignedSiteId = site.rows[0].id;
      const task = await pool.query<{ id: string }>(
        `INSERT INTO floorwalk.inspection_tasks
           (org_id, site_id, template_id, task_date, position, occurrence,
            starts_at, due_at, status)
         SELECT site.org_id, site.id, $2, CURRENT_DATE, 0, 0,
           now() - interval '2 hours', now() - interval '1 hour', 'overdue'
         FROM floorwalk.sites site WHERE site.id = $1 RETURNING id`,
        [unassignedSiteId, templateId],
      );
      unassignedTaskId = task.rows[0].id;
      const inspection = await pool.query<{ id: string }>(
        `INSERT INTO floorwalk.inspections
           (task_id, site_id, template_id, inspector_id, status, score, decided_at)
         VALUES ($1, $2, $3, NULL, 'failed', 0, now()) RETURNING id`,
        [unassignedTaskId, unassignedSiteId, templateId],
      );
      unassignedInspectionId = inspection.rows[0].id;
      await pool.query(
        `INSERT INTO floorwalk.inspection_items
           (inspection_id, position, title, min_photo_count, acceptance_criteria,
            critical, result, first_result, incomplete)
         VALUES ($1, 1, '审核项', 0, '', false, 'fail', 'fail', true)`,
        [unassignedInspectionId],
      );

      const adminDashboard = await request(app.getHttpServer())
        .get('/api/dashboard/sites')
        .set('Cookie', hqCookie)
        .expect(200);
      const adminDashboardSites = dashboardSitesResponseSchema.parse(
        adminDashboard.body,
      );
      expect(
        adminDashboardSites.filter((entry) =>
          entry.site.code.startsWith('NB-'),
        ),
      ).toHaveLength(12);
      expect(
        adminDashboardSites.some((entry) => entry.site.id === unassignedSiteId),
      ).toBe(true);
      const adminQueue = await request(app.getHttpServer())
        .get('/api/review/tasks')
        .set('Cookie', hqCookie)
        .expect(200);
      expect(
        taskReviewQueueResponseSchema
          .parse(adminQueue.body)
          .some((entry) => entry.id === unassignedTaskId),
      ).toBe(true);
      const taskReview = await request(app.getHttpServer())
        .get(`/api/tasks/${unassignedTaskId}/review`)
        .set('Cookie', hqCookie)
        .expect(200);
      const reviewBody = taskReviewSchema.parse(taskReview.body);
      expect(reviewBody.site.id).toBe(unassignedSiteId);
      const decided = await request(app.getHttpServer())
        .post(
          `/api/tasks/${unassignedTaskId}/items/${reviewBody.items[0].id}/decision`,
        )
        .set('Cookie', hqCookie)
        .send({ result: 'pass' })
        .expect(201);
      expect(taskReviewSchema.parse(decided.body).inspectionStatus).toBe(
        'passed',
      );
    } finally {
      if (unassignedInspectionId) {
        await pool.query(
          `DELETE FROM floorwalk.inspection_item_decisions
           WHERE inspection_item_id IN
             (SELECT id FROM floorwalk.inspection_items WHERE inspection_id = $1)`,
          [unassignedInspectionId],
        );
        await pool.query(
          'DELETE FROM floorwalk.inspection_items WHERE inspection_id = $1',
          [unassignedInspectionId],
        );
        await pool.query('DELETE FROM floorwalk.inspections WHERE id = $1', [
          unassignedInspectionId,
        ]);
      }
      if (unassignedTaskId)
        await pool.query(
          'DELETE FROM floorwalk.inspection_tasks WHERE id = $1',
          [unassignedTaskId],
        );
      if (unassignedSiteId)
        await pool.query('DELETE FROM floorwalk.sites WHERE id = $1', [
          unassignedSiteId,
        ]);
      await pool.end();
    }
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
           AND site.org_id = (SELECT org.id FROM floorwalk.organizations org WHERE org.name = 'Northbean')
           AND inspector.login_name = 'inspector@northbean.example'
           AND inspector.org_id = site.org_id
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
      .set('Cookie', hqCookie)
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
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/inspections/${inspectionId}/messages`)
      .set('Cookie', hqCookie)
      .field('text', '管理员回复')
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/inspections/${chatInspectionId}/messages`)
      .set('Cookie', inspectorCookie)
      .field('text', '外店不能发言')
      .expect(404);

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
      .set('Cookie', inspectorCookie)
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
      .set('Cookie', hqCookie)
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
    })
      .overrideProvider(TaskSchedulerService)
      .useValue({})
      .compile();
    const secondApp =
      secondModule.createNestApplication<NestExpressApplication>();
    await secondApp.init();
    try {
      expect(secondApp.get(DATABASE_POOL)).not.toBe(app.get(DATABASE_POOL));
    } finally {
      await secondApp.close();
    }
  });

  it('exposes every existing contracted endpoint with its response schema', async () => {
    const loginChoices = await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({
        loginName: 'inspector@northbean.example',
        password: 'northbean-demo',
      })
      .expect(201);
    const orgId = loginChoices.body.organizations.find(
      (org: { name: string }) => org.name === 'Northbean',
    )?.id;
    expect(orgId).toBeDefined();
    const login = await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({
        loginName: 'inspector@northbean.example',
        password: 'northbean-demo',
        orgId,
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
    const taskItems = todayBody.templates.find(
      (template) => template.id === templateId,
    )!.items;
    const pool = createPool();
    try {
      const task = await pool.query<{ id: string }>(
        `INSERT INTO floorwalk.inspection_tasks
           (org_id, site_id, template_id, task_date, position, occurrence,
            starts_at, due_at, status)
         SELECT site.org_id, site.id, $2, CURRENT_DATE + 1, 999, 0,
           now() - interval '2 hours', now() + interval '2 hours', 'not_started'
         FROM floorwalk.sites site WHERE site.id = $1
         RETURNING id`,
        [northbeanSiteId, templateId],
      );
      createdTaskId = task.rows[0].id;
    } finally {
      await pool.end();
    }

    const photoItem = taskItems.find((item) => item.minPhotoCount > 0)!;
    await request(app.getHttpServer())
      .post(`/api/tasks/${createdTaskId}/items/${photoItem.position}/uploads`)
      .set('Cookie', inspectorCookie)
      .field('selfAssessment', 'pass')
      .attach('files', Buffer.from('invalid-mime'), {
        filename: 'contract.gif',
        contentType: 'image/gif',
      })
      .expect(400)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('VALIDATION_FAILED'),
      );
    await request(app.getHttpServer())
      .post(`/api/tasks/${createdTaskId}/items/${photoItem.position}/uploads`)
      .set('Cookie', inspectorCookie)
      .field('selfAssessment', 'pass')
      .attach('files', Buffer.alloc(10 * 1024 * 1024 + 1), {
        filename: 'too-large.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400)
      .expect(({ body }) =>
        expect(errorResponseSchema.parse(body).code).toBe('VALIDATION_FAILED'),
      );

    const uploadTaskItem = async (item: (typeof taskItems)[number]) => {
      let upload = request(app.getHttpServer())
        .post(`/api/tasks/${createdTaskId}/items/${item.position}/uploads`)
        .set('Cookie', inspectorCookie)
        .field('selfAssessment', 'pass');
      if (item.minPhotoCount === 0) upload = upload.field('note', '现场已检查');
      for (let index = 0; index < item.minPhotoCount; index++)
        upload = upload.attach('files', Buffer.from('contract-test'), {
          filename: `${item.position}-${index}.jpg`,
          contentType: 'image/jpeg',
        });
      const response = await upload.expect(201);
      const body = taskItemUploadResponseSchema.parse(response.body);
      createdInspectionId = body.inspectionId;
      for (const evidence of body.evidence) {
        createdEvidenceStorageKeys.push(evidence.storageKey);
        primaryEvidenceId ??= evidence.id;
      }
      return response;
    };

    let primaryEvidenceId: string | undefined;
    let taskUpload = await uploadTaskItem(taskItems[0]);
    for (const item of taskItems.slice(1))
      taskUpload = await uploadTaskItem(item);
    expect(createdInspectionId).toBeDefined();
    expect(primaryEvidenceId).toBeDefined();
    const taskStatusPool = createPool();
    let taskStatus: { status: string } | undefined;
    try {
      const result = await taskStatusPool.query<{ status: string }>(
        'SELECT status FROM floorwalk.inspection_tasks WHERE id = $1',
        [createdTaskId],
      );
      taskStatus = result.rows[0];
    } finally {
      await taskStatusPool.end();
    }
    expect(taskStatus?.status).toBe('submitted');

    const inspectorTaskDetail = await request(app.getHttpServer())
      .get(`/api/inspector/tasks/${createdTaskId}`)
      .set('Cookie', inspectorCookie)
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/api/inspections/${createdInspectionId}`)
      .set('Cookie', inspectorCookie)
      .expect(200);
    const detailBody = inspectionDetailSchema.parse(detail.body);
    expect(detailBody.site.code).toBe('NB-001');

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

    const signed = await request(app.getHttpServer())
      .get(`/api/evidence/${primaryEvidenceId!}`)
      .set('Cookie', inspectorCookie)
      .expect(200);
    signedEvidenceResponseSchema.parse(signed.body);

    const queue = await request(app.getHttpServer())
      .get('/api/review/tasks')
      .set('Cookie', hqCookie)
      .expect(200);
    const queueBody = taskReviewQueueResponseSchema.parse(queue.body);
    expect(queueBody.some((task) => task.id === createdTaskId)).toBe(true);
    const taskReview = await request(app.getHttpServer())
      .get(`/api/tasks/${createdTaskId}/review`)
      .set('Cookie', hqCookie)
      .expect(200);
    const taskReviewBody = taskReviewSchema.parse(taskReview.body);
    expect(taskReviewBody.inspectionId).toBe(createdInspectionId);
    const reviewedItem = taskReviewBody.items[0];
    const decided = await request(app.getHttpServer())
      .post(`/api/tasks/${createdTaskId}/items/${reviewedItem.id}/decision`)
      .set('Cookie', hqCookie)
      .send({ result: 'pass' })
      .expect(201);
    taskReviewSchema.parse(decided.body);

    const dashboard = await request(app.getHttpServer())
      .get('/api/dashboard/sites')
      .set('Cookie', hqCookie)
      .expect(200);
    dashboardSitesResponseSchema.parse(dashboard.body);
    const selfCheckStats = await request(app.getHttpServer())
      .get('/api/stats/self-check')
      .query({
        scope: 'site',
        id: northbeanSiteId,
        from: '2026-01-01',
        to: '2026-12-31',
      })
      .set('Cookie', hqCookie)
      .expect(200);
    expect(taskItems).toHaveLength(8);

    const deletedSession = await request(app.getHttpServer())
      .delete('/api/auth/session')
      .expect(204);
    expect(deletedSession.text).toBe('');
    const chatListResponse = await request(app.getHttpServer())
      .get(`/api/inspections/${chatInspectionId}/messages`)
      .set('Cookie', hqCookie)
      .expect(200);
    const chatCreateResponse = await request(app.getHttpServer())
      .post(`/api/inspections/${inspectionId}/messages`)
      .set('Cookie', inspectorCookie)
      .field('text', '路由表 schema 验证消息')
      .expect(201);
    createdChatMessageIds.push(
      chatMessageSchema.parse(chatCreateResponse.body).id,
    );
    const chatImageUrlResponse = await request(app.getHttpServer())
      .get(`/api/messages/${chatImageMessageId}/image-url`)
      .set('Cookie', hqCookie)
      .expect(200);
    const recordListResponse = await request(app.getHttpServer())
      .get('/api/inspector/inspections')
      .set('Cookie', inspectorCookie)
      .expect(200);
    const adminSiteListResponse = await request(app.getHttpServer())
      .get('/api/admin/sites')
      .set('Cookie', hqCookie)
      .expect(200);
    const adminSiteCreateResponse = await request(app.getHttpServer())
      .post('/api/admin/sites')
      .set('Cookie', hqCookie)
      .send({ code: 'FW-011-ROUTE', name: '路由表测试门店' })
      .expect(201);
    const adminSiteUpdateResponse = await request(app.getHttpServer())
      .patch(`/api/admin/sites/${adminSiteCreateResponse.body.id}`)
      .set('Cookie', hqCookie)
      .send({ active: false })
      .expect(200);
    const adminTemplateListResponse = await request(app.getHttpServer())
      .get('/api/admin/templates')
      .set('Cookie', hqCookie)
      .expect(200);
    const adminTemplateCreateResponse = await request(app.getHttpServer())
      .post('/api/admin/templates')
      .set('Cookie', hqCookie)
      .send({
        name: 'FW-011 路由表测试模板',
        aiEnabled: false,
        items: [
          {
            title: '测试项',
            minPhotoCount: 0,
            acceptanceCriteria: '',
            critical: false,
          },
        ],
      })
      .expect(201);
    const adminTemplateUpdateResponse = await request(app.getHttpServer())
      .put(`/api/admin/templates/${adminTemplateCreateResponse.body.id}`)
      .set('Cookie', hqCookie)
      .send({
        name: 'FW-011 路由表测试模板更新',
        aiEnabled: false,
        items: [
          {
            position: 1,
            title: '测试项',
            minPhotoCount: 0,
            acceptanceCriteria: '',
            critical: false,
          },
        ],
      })
      .expect(200);
    createdAdminSiteIds.push(adminSiteCreateResponse.body.id);
    createdAdminTemplateIds.push(adminTemplateCreateResponse.body.id);
    const scheduleDefinition = {
      name: `FW-027 路由表日程 ${randomUUID()}`,
      days: Array.from({ length: 7 }, (_, index) => ({
        weekday: index + 1,
        enabled: true,
        tasks:
          index === 0
            ? [
                {
                  templateId: adminTemplateCreateResponse.body.id,
                  startsAt: '23:30',
                  endsAt: '01:15',
                },
              ]
            : [],
      })),
    };
    const adminScheduleCreateResponse = await request(app.getHttpServer())
      .post('/api/admin/schedules')
      .set('Cookie', hqCookie)
      .send(scheduleDefinition)
      .expect(201);
    createdScheduleIds.push(adminScheduleCreateResponse.body.id);
    const adminScheduleUpdateResponse = await request(app.getHttpServer())
      .put(`/api/admin/schedules/${adminScheduleCreateResponse.body.id}`)
      .set('Cookie', hqCookie)
      .send({ ...scheduleDefinition, name: `${scheduleDefinition.name}更新` })
      .expect(200);
    const adminScheduleListResponse = await request(app.getHttpServer())
      .get('/api/admin/schedules')
      .set('Cookie', hqCookie)
      .expect(200);
    const siteIds = [adminSiteCreateResponse.body.id];
    const adminSiteScheduleAssignResponse = await request(app.getHttpServer())
      .put('/api/admin/site-schedules')
      .set('Cookie', hqCookie)
      .send({ siteIds, scheduleId: adminScheduleCreateResponse.body.id })
      .expect(200);
    const adminSiteScheduleListResponse = await request(app.getHttpServer())
      .get('/api/admin/site-schedules')
      .set('Cookie', hqCookie)
      .expect(200);
    const adminSiteScheduleSkipAddResponse = await request(app.getHttpServer())
      .post('/api/admin/site-schedules/skips')
      .set('Cookie', hqCookie)
      .send({
        siteIds,
        startsOn: '2026-11-16',
        endsOn: '2026-11-18',
        note: '路由表区间',
      })
      .expect(201);
    const skippedSite = apiRoutes.addAdminSiteScheduleSkips.responseSchema
      .parse(adminSiteScheduleSkipAddResponse.body)
      .find((site) => site.siteId === siteIds[0]);
    expect(skippedSite?.skippedRanges).toHaveLength(1);
    const adminSiteScheduleSkipDeleteResponse = await request(
      app.getHttpServer(),
    )
      .delete(
        `/api/admin/site-schedules/skips/${skippedSite!.skippedRanges[0].id}`,
      )
      .set('Cookie', hqCookie)
      .expect(204);
    await request(app.getHttpServer())
      .put('/api/admin/site-schedules')
      .set('Cookie', hqCookie)
      .send({ siteIds, scheduleId: null })
      .expect(200);
    const adminScheduleDeleteResponse = await request(app.getHttpServer())
      .delete(`/api/admin/schedules/${adminScheduleCreateResponse.body.id}`)
      .set('Cookie', hqCookie)
      .expect(204);
    const adminAiStandardCreateResponse = await request(app.getHttpServer())
      .post('/api/admin/ai-standards')
      .set('Cookie', hqCookie)
      .send({ name: '路由表测试标准', prompt: '按检查项验收要点审核。' })
      .expect(201);
    createdAiStandardIds.push(adminAiStandardCreateResponse.body.id);
    const adminAiStandardUpdateResponse = await request(app.getHttpServer())
      .put(`/api/admin/ai-standards/${adminAiStandardCreateResponse.body.id}`)
      .set('Cookie', hqCookie)
      .send({
        name: '路由表测试标准更新',
        prompt: '逐项核对验收要点并说明原因。',
      })
      .expect(200);
    const adminAiStandardListResponse = await request(app.getHttpServer())
      .get('/api/admin/ai-standards')
      .set('Cookie', hqCookie)
      .expect(200);
    const adminAiStandardDeleteResponse = await request(app.getHttpServer())
      .delete(
        `/api/admin/ai-standards/${adminAiStandardCreateResponse.body.id}`,
      )
      .set('Cookie', hqCookie)
      .expect(204);
    const quickSetupResponse = await request(app.getHttpServer())
      .post('/api/admin/templates/quick-setup')
      .set('Cookie', hqCookie)
      .send({ kind: 'coffee' })
      .expect(201);
    createdAdminTemplateIds.push(quickSetupResponse.body.template.id);
    createdAiStandardIds.push(quickSetupResponse.body.standard.id);
    const registrationEmail = `protocol-route-${randomUUID()}@example.test`;
    createdProtocolEmails.push(registrationEmail);
    const registrationCodeResponse = await request(app.getHttpServer())
      .post('/api/auth/registration-code')
      .send({ email: registrationEmail })
      .expect(201);
    const registrationMailbox = await request(app.getHttpServer())
      .get('/api/testing/mailbox')
      .query({ recipient: registrationEmail })
      .expect(200);
    const recoveryOrg = await request(app.getHttpServer())
      .post('/api/orgs')
      .send({
        orgName: `FW-025 route recovery ${randomUUID()}`,
        adminName: '路由表管理员',
        email: registrationEmail,
        password: 'registration-password',
        verificationCode: registrationMailbox.body.code,
      })
      .expect(201);
    createdProtocolOrgIds.push(recoveryOrg.body.org.id);
    const passwordRecoveryCodeResponse = await request(app.getHttpServer())
      .post('/api/auth/password-recovery-code')
      .send({ email: registrationEmail })
      .expect(201);
    const passwordRecoveryMailbox = await request(app.getHttpServer())
      .get('/api/testing/mailbox')
      .query({ recipient: registrationEmail })
      .expect(200);
    const passwordRecoveryVerification = await request(app.getHttpServer())
      .post('/api/auth/password-recovery/verify')
      .send({
        email: registrationEmail,
        code: passwordRecoveryMailbox.body.code,
      })
      .expect(201);
    const passwordRecoveryResetResponse = await request(app.getHttpServer())
      .post('/api/auth/password-recovery/reset')
      .send({
        resetToken: passwordRecoveryVerification.body.resetToken,
        orgId: recoveryOrg.body.org.id,
        password: 'recovered-password',
      })
      .expect(204);
    const routeResponses = {
      createSession: login,
      deleteSession: deletedSession,
      requestRegistrationCode: registrationCodeResponse,
      requestPasswordRecoveryCode: passwordRecoveryCodeResponse,
      verifyPasswordRecoveryCode: passwordRecoveryVerification,
      resetPasswordRecovery: passwordRecoveryResetResponse,
      me,
      today,
      getInspection: detail,
      uploadTaskItem: taskUpload,
      getInspectorTask: inspectorTaskDetail,
      getEvidence: signed,
      reviewTaskQueue: queue,
      getTaskReview: taskReview,
      decideTaskItem: decided,
      dashboardSites: dashboard,
      selfCheckStats,
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
      listAdminAiStandards: adminAiStandardListResponse,
      createAdminAiStandard: adminAiStandardCreateResponse,
      updateAdminAiStandard: adminAiStandardUpdateResponse,
      deleteAdminAiStandard: adminAiStandardDeleteResponse,
      quickSetupAdminTemplate: quickSetupResponse,
      listAdminSchedules: adminScheduleListResponse,
      createAdminSchedule: adminScheduleCreateResponse,
      updateAdminSchedule: adminScheduleUpdateResponse,
      deleteAdminSchedule: adminScheduleDeleteResponse,
      listAdminSiteSchedules: adminSiteScheduleListResponse,
      assignAdminSiteSchedule: adminSiteScheduleAssignResponse,
      addAdminSiteScheduleSkips: adminSiteScheduleSkipAddResponse,
      deleteAdminSiteScheduleSkip: adminSiteScheduleSkipDeleteResponse,
    };
    for (const [routeKey, route] of Object.entries(apiRoutes)) {
      if (Object.hasOwn(protocolRouteBodies, routeKey)) {
        const response = await protocolRequest(
          routeKey as keyof typeof protocolRouteBodies,
          hqCookie,
        );
        expect(response.status).toBe(
          routeKey === 'createOrg' || routeKey === 'listAdminUsers'
            ? route.successStatus
            : routeKey === 'createAdminUser'
              ? 400
              : routeKey === 'updateAdminUser' ||
                  routeKey === 'resetAdminUserPassword'
                ? 404
                : routeKey === 'changePassword'
                  ? 401
                  : 501,
        );
        if (routeKey === 'createOrg') {
          route.responseSchema.parse(response.body);
          createdProtocolOrgIds.push(response.body.org.id);
        } else if (routeKey === 'listAdminUsers') {
          route.responseSchema.parse(response.body);
        }
      } else {
        const response =
          routeResponses[routeKey as keyof typeof routeResponses];
        expect(response, `${routeKey} response coverage`).toBeDefined();
        expect(response.status).toBe(route.successStatus);
        route.responseSchema.parse(
          route.successStatus === 204 ? undefined : response.body,
        );
      }
    }
  }, 60000);

  it('normalizes validation, not found, and CORS responses', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({ loginName: 'invalid' })
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
      .post('/api/inspections')
      .set('Cookie', inspectorCookie)
      .send({ templateId })
      .expect(404);
    await request(app.getHttpServer())
      .patch(
        `/api/inspections/${inspectionId}/items/00000000-0000-4000-8000-000000000000`,
      )
      .set('Cookie', inspectorCookie)
      .send({ result: 'pass' })
      .expect(404);
    await request(app.getHttpServer())
      .post(
        `/api/inspections/${inspectionId}/items/00000000-0000-4000-8000-000000000000/evidence`,
      )
      .set('Cookie', inspectorCookie)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/inspections/${inspectionId}/submit`)
      .set('Cookie', inspectorCookie)
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/review/queue')
      .set('Cookie', hqCookie)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/inspections/${inspectionId}/review`)
      .set('Cookie', hqCookie)
      .send({ action: 'approve' })
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/me')
      .set('Origin', 'http://127.0.0.1:3019')
      .set('Cookie', inspectorCookie)
      .expect('access-control-allow-origin', 'http://127.0.0.1:3019');
  });
});
