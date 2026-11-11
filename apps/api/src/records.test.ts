import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  inspectorRecordsResponseSchema,
  loginResponseSchema,
} from '@libs/shared';
import type { InspectorRecordsResponse } from '@libs/shared';
import { AppModule } from './app.module.js';
import { HttpErrorFilter } from './http-exception.filter.js';
import { createPool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';

describe('inspector records API', () => {
  let app: NestExpressApplication;
  let inspectorCookie: string;
  let inspectorId: string;
  let inspectorSiteId: string;
  let inspectorOrgId: string;
  let templateName: string;
  let colleagueId: string;
  let recordIds: string[] = [];
  const taskIds: string[] = [];

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({
        loginName: 'manager2@northbean.example',
        password: 'northbean-demo',
      })
      .expect(201);
    loginResponseSchema.parse(login.body);
    inspectorCookie = (
      login.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];

    const pool = createPool();
    try {
      const site = await pool.query<{ id: string; orgId: string }>(
        'SELECT id, org_id AS "orgId" FROM floorwalk.sites WHERE code = $1',
        ['NB-001'],
      );
      const inspector = await pool.query<{
        id: string;
        siteId: string;
        orgId: string;
      }>(
        `SELECT id, site_id AS "siteId", org_id AS "orgId"
         FROM floorwalk.users WHERE login_name = $1`,
        ['manager2@northbean.example'],
      );
      inspectorId = inspector.rows[0].id;
      inspectorSiteId = inspector.rows[0].siteId;
      inspectorOrgId = inspector.rows[0].orgId;
      expect(inspectorSiteId).toBe(site.rows[0].id);
      const template = await pool.query<{ id: string; name: string }>(
        'SELECT id, name FROM floorwalk.templates WHERE org_id = $1 ORDER BY name LIMIT 1',
        [site.rows[0].orgId],
      );
      templateName = template.rows[0].name;
      const colleague = await pool.query<{ id: string }>(
        `INSERT INTO floorwalk.users (login_name, password_hash, display_name, role, site_id, org_id)
         VALUES ($1, 'test-hash', '同店店长', 'store_manager', $2, (SELECT org_id FROM floorwalk.sites WHERE id = $2)) RETURNING id`,
        [`records-${crypto.randomUUID()}@northbean.example`, site.rows[0].id],
      );
      colleagueId = colleague.rows[0].id;
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO floorwalk.inspections
           (site_id, template_id, inspector_id, created_at)
         SELECT $1, $2, $3, '2099-10-29T12:00:00.123456Z'::timestamptz
         FROM generate_series(1, 12)
         RETURNING id`,
        [site.rows[0].id, template.rows[0].id, colleagueId],
      );
      recordIds = inserted.rows.map((row) => row.id);
      const task = await pool.query<{ id: string }>(
        `INSERT INTO floorwalk.inspection_tasks
           (org_id, site_id, template_id, task_date, position, occurrence,
            starts_at, due_at, status)
         VALUES ($1, $2, $3, $4, $5, $5, $6, $7, 'submitted')
         RETURNING id`,
        [
          site.rows[0].orgId,
          site.rows[0].id,
          template.rows[0].id,
          '2099-10-29',
          900000,
          '2099-10-29T12:00:00Z',
          '2099-10-29T13:00:00Z',
        ],
      );
      taskIds.push(task.rows[0].id);
      await pool.query(
        'UPDATE floorwalk.inspections SET task_id = $1 WHERE id = $2',
        [task.rows[0].id, recordIds[0]],
      );
    } finally {
      await pool.end();
    }
  }, 60000);

  afterAll(async () => {
    const pool = createPool();
    try {
      if (recordIds.length)
        await pool.query(
          'DELETE FROM floorwalk.inspections WHERE id = ANY($1::uuid[])',
          [recordIds],
        );
      if (taskIds.length)
        await pool.query(
          'DELETE FROM floorwalk.inspection_tasks WHERE id = ANY($1::uuid[])',
          [taskIds],
        );
      if (colleagueId)
        await pool.query('DELETE FROM floorwalk.users WHERE id = $1', [
          colleagueId,
        ]);
      await pool.query('DELETE FROM floorwalk.sessions');
    } finally {
      await pool.end();
      await app?.close();
    }
  });

  it('paginates all same-site records without gaps and rejects other roles and invalid inputs', async () => {
    const pool = createPool();
    let expectedIds: string[];
    let otherSiteIds: string[];
    try {
      const expected = await pool.query<{ id: string }>(
        `SELECT inspection.id
         FROM floorwalk.inspections inspection
         JOIN floorwalk.sites site ON site.id = inspection.site_id
         WHERE site.code = 'NB-001'
         ORDER BY inspection.created_at DESC, inspection.id DESC`,
      );
      const otherSite = await pool.query<{ id: string }>(
        `SELECT inspection.id
         FROM floorwalk.inspections inspection
         JOIN floorwalk.sites site ON site.id = inspection.site_id
         WHERE site.code <> 'NB-001'`,
      );
      expectedIds = expected.rows.map((row) => row.id);
      otherSiteIds = otherSite.rows.map((row) => row.id);
    } finally {
      await pool.end();
    }

    const returnedIds: string[] = [];
    const returnedItems: InspectorRecordsResponse['items'] = [];
    let cursor: string | null = null;
    const pageSizes: number[] = [];
    do {
      const path = cursor
        ? `/api/inspector/inspections?cursor=${encodeURIComponent(cursor)}`
        : '/api/inspector/inspections';
      const response = await request(app.getHttpServer())
        .get(path)
        .set('Cookie', inspectorCookie)
        .expect(200);
      const page = inspectorRecordsResponseSchema.parse(response.body);
      returnedIds.push(...page.items.map((item) => item.id));
      returnedItems.push(...page.items);
      pageSizes.push(page.items.length);
      cursor = page.nextCursor;
    } while (cursor);

    expect(pageSizes).toEqual(
      Array.from({ length: Math.ceil(expectedIds.length / 10) }, (_, index) =>
        Math.min(10, expectedIds.length - index * 10),
      ),
    );
    expect(returnedIds).toEqual(expectedIds);
    expect(returnedIds).toEqual(expect.arrayContaining(recordIds));
    expect(returnedIds.some((id) => otherSiteIds.includes(id))).toBe(false);
    expect(
      returnedItems.find((item) => item.id === recordIds[0]),
    ).toMatchObject({
      taskDate: '2099-10-29',
      templateName,
      taskStatus: 'submitted',
    });
    expect(
      returnedItems.find((item) => item.id === recordIds[1]),
    ).toMatchObject({
      taskDate: null,
      templateName,
      taskStatus: null,
    });

    await request(app.getHttpServer())
      .get('/api/inspector/inspections?limit=51')
      .set('Cookie', inspectorCookie)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/inspector/inspections?cursor=not-a-cursor')
      .set('Cookie', inspectorCookie)
      .expect(400);

    const hq = await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({ loginName: 'hq@northbean.example', password: 'northbean-demo' })
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/inspector/inspections')
      .set('Cookie', (hq.headers['set-cookie'] as unknown as string[])[0])
      .expect(403);
  });

  it('调店后只保留当前门店全部记录及本人参与过的历史记录', async () => {
    const pool = createPool();
    let destinationSiteId: string;
    try {
      const destination = await pool.query<{ id: string }>(
        `SELECT id FROM floorwalk.sites
         WHERE org_id = $1 AND id <> $2 ORDER BY code LIMIT 1`,
        [inspectorOrgId, inspectorSiteId],
      );
      destinationSiteId = destination.rows[0].id;
      await pool.query(
        `INSERT INTO floorwalk.inspection_participants (inspection_id, user_id)
         VALUES ($1, $2)`,
        [recordIds[0], inspectorId],
      );
      await pool.query(
        'UPDATE floorwalk.users SET site_id = $1 WHERE id = $2',
        [destinationSiteId, inspectorId],
      );

      const response = await request(app.getHttpServer())
        .get('/api/inspector/inspections?limit=50')
        .set('Cookie', inspectorCookie)
        .expect(200);
      const page = inspectorRecordsResponseSchema.parse(response.body);
      expect(page.nextCursor).toBeNull();
      const returnedIds = page.items.map((item) => item.id);
      expect(returnedIds).toContain(recordIds[0]);
      expect(returnedIds).not.toContain(recordIds[1]);

      const originalSiteRecords = await pool.query<{ id: string }>(
        'SELECT id FROM floorwalk.inspections WHERE site_id = $1',
        [inspectorSiteId],
      );
      const participants = await pool.query<{ id: string }>(
        `SELECT inspection.id
         FROM floorwalk.inspections inspection
         JOIN floorwalk.inspection_participants participant
           ON participant.inspection_id = inspection.id
         WHERE inspection.site_id = $1 AND participant.user_id = $2`,
        [inspectorSiteId, inspectorId],
      );
      const originalIds = new Set(
        originalSiteRecords.rows.map((row) => row.id),
      );
      expect(returnedIds.filter((id) => originalIds.has(id)).sort()).toEqual(
        participants.rows.map((row) => row.id).sort(),
      );
    } finally {
      await pool.query(
        'UPDATE floorwalk.users SET site_id = $1 WHERE id = $2',
        [inspectorSiteId, inspectorId],
      );
      await pool.end();
    }
  });
});
