import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from './app.module.js';
import { createPool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';
import { HttpErrorFilter } from './http-exception.filter.js';

describe('inspection chat authorization', () => {
  let app: NestExpressApplication;
  let pool: ReturnType<typeof createPool>;
  let inspectorCookie: string;
  let hqCookie: string;
  let passedInspectionId: string;
  let otherSiteInspectionId: string;
  let createdMessageId: string | undefined;

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    pool = createPool();
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
      return (response.headers['set-cookie'] as unknown as string[])[0].split(
        ';',
      )[0];
    };
    inspectorCookie = await login('inspector@northbean.example');
    hqCookie = await login('hq@northbean.example');

    const inspections = await pool.query<{ id: string; code: string }>(
      `SELECT i.id, s.code
       FROM floorwalk.inspections i
       JOIN floorwalk.sites s ON s.id = i.site_id
       WHERE (s.code = 'NB-001' AND i.status = 'passed')
          OR (s.code = 'NB-002' AND i.status = 'rework')
       ORDER BY i.created_at DESC`,
    );
    passedInspectionId = inspections.rows.find(
      (row) => row.code === 'NB-001',
    )!.id;
    otherSiteInspectionId = inspections.rows.find(
      (row) => row.code === 'NB-002',
    )!.id;
  }, 60000);

  afterAll(async () => {
    try {
      if (createdMessageId)
        await pool.query('DELETE FROM floorwalk.chat_messages WHERE id = $1', [
          createdMessageId,
        ]);
      await pool.query('DELETE FROM floorwalk.sessions');
    } finally {
      await pool.end();
      await app.close();
    }
  });

  it('blocks HQ from sending and an inspector from reading another site', async () => {
    await request(app.getHttpServer())
      .post(`/api/inspections/${passedInspectionId}/messages`)
      .set('Cookie', hqCookie)
      .field('text', '总部只读')
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/inspections/${otherSiteInspectionId}/messages`)
      .set('Cookie', inspectorCookie)
      .expect(403);
  });

  it('allows the assigned inspector to send after the inspection is closed', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/inspections/${passedInspectionId}/messages`)
      .set('Cookie', inspectorCookie)
      .field('text', '结束状态仍可留言。')
      .expect(201);
    createdMessageId = response.body.id as string;
    expect(response.body.body).toBe('结束状态仍可留言。');

    const persisted = await pool.query(
      'SELECT id FROM floorwalk.chat_messages WHERE id = $1 AND inspection_id = $2',
      [createdMessageId, passedInspectionId],
    );
    expect(persisted.rows).toHaveLength(1);
  });
});
