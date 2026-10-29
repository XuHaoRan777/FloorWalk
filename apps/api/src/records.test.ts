import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  inspectorRecordsResponseSchema,
  loginResponseSchema,
} from '@libs/shared';
import { AppModule } from './app.module.js';
import { HttpErrorFilter } from './http-exception.filter.js';
import { createPool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';

describe('inspector records API', () => {
  let app: NestExpressApplication;
  let inspectorCookie: string;
  let colleagueId: string;
  let recordIds: string[] = [];

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
        email: 'inspector@northbean.example',
        password: 'northbean-demo',
      })
      .expect(201);
    loginResponseSchema.parse(login.body);
    inspectorCookie = (
      login.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];

    const pool = createPool();
    try {
      const site = await pool.query<{ id: string }>(
        "SELECT id FROM floorwalk.sites WHERE code = 'NB-001'",
      );
      const template = await pool.query<{ id: string }>(
        'SELECT id FROM floorwalk.templates LIMIT 1',
      );
      const colleague = await pool.query<{ id: string }>(
        `INSERT INTO floorwalk.users (email, password_hash, display_name, role, site_id)
         VALUES ($1, 'test-hash', '同店店员', 'inspector', $2) RETURNING id`,
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

    await request(app.getHttpServer())
      .get('/api/inspector/inspections?limit=51')
      .set('Cookie', inspectorCookie)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/inspector/inspections?cursor=not-a-cursor')
      .set('Cookie', inspectorCookie)
      .expect(400);

    const supervisor = await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({
        email: 'supervisor@northbean.example',
        password: 'northbean-demo',
      })
      .expect(201);
    const hq = await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({ email: 'hq@northbean.example', password: 'northbean-demo' })
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/inspector/inspections')
      .set(
        'Cookie',
        (supervisor.headers['set-cookie'] as unknown as string[])[0],
      )
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/inspector/inspections')
      .set('Cookie', (hq.headers['set-cookie'] as unknown as string[])[0])
      .expect(403);
  });
});
