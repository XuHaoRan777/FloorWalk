import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from './app.module.js';
import { createPool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';
import {
  dashboardSitesResponseSchema,
  evidenceSchema,
  inspectionDetailSchema,
  inspectionSchema,
  loginResponseSchema,
  reviewQueueResponseSchema,
  reviewRequestSchema,
  signedEvidenceResponseSchema,
  submitInspectionResponseSchema,
  todayResponseSchema,
  updateInspectionItemRequestSchema,
  userSchema,
} from '@libs/shared';

describe('inspection contract API', () => {
  let app: NestExpressApplication;
  let inspectorToken: string;
  let supervisorToken: string;
  let hqToken: string;
  let inspectionId: string;
  let otherSiteInspectionId: string;
  let evidenceId: string;
  let otherSiteEvidenceId: string;

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule,
        JwtModule.register({ secret: process.env.JWT_SECRET }),
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();
    const inspector = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'inspector@northbean.example',
        password: 'northbean-demo',
      })
      .expect(201);
    const supervisor = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'supervisor@northbean.example',
        password: 'northbean-demo',
      })
      .expect(201);
    const hq = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'hq@northbean.example', password: 'northbean-demo' })
      .expect(201);
    inspectorToken = loginResponseSchema.parse(inspector.body).token;
    supervisorToken = loginResponseSchema.parse(supervisor.body).token;
    hqToken = loginResponseSchema.parse(hq.body).token;
    const pool = createPool();
    try {
      const result = await pool.query<{ id: string; code: string }>(
        `SELECT i.id
                , s.code
         FROM floorwalk.inspections i
         JOIN floorwalk.sites s ON s.id = i.site_id
         ORDER BY i.created_at`,
      );
      inspectionId = result.rows.find((row) => row.code === 'NB-001')!.id;
      otherSiteInspectionId = result.rows.find(
        (row) => row.code !== 'NB-001',
      )!.id;
      const itemRows = await pool.query<{
        id: string;
        inspection_id: string;
      }>(
        `SELECT ii.id, ii.inspection_id
         FROM floorwalk.inspection_items ii
         WHERE ii.inspection_id = ANY($1::uuid[])
         ORDER BY ii.created_at`,
        [[inspectionId, otherSiteInspectionId]],
      );
      for (const item of itemRows.rows) {
        const inserted = await pool.query<{ id: string }>(
          `INSERT INTO floorwalk.evidence (inspection_item_id, storage_key, mime, size)
           VALUES ($1, $2, 'image/jpeg', 1) RETURNING id`,
          [item.id, `contract-test/${item.inspection_id}.jpg`],
        );
        if (item.inspection_id === inspectionId)
          evidenceId = inserted.rows[0].id;
        else otherSiteEvidenceId = inserted.rows[0].id;
      }
    } finally {
      await pool.end();
    }
  });

  afterAll(async () => {
    await app.close();
    if (evidenceId && otherSiteEvidenceId) {
      const pool = createPool();
      try {
        await pool.query(
          'DELETE FROM floorwalk.evidence WHERE id = ANY($1::uuid[])',
          [[evidenceId, otherSiteEvidenceId]],
        );
      } finally {
        await pool.end();
      }
    }
  });

  it('authenticates the three roles and rejects invalid access', async () => {
    const me = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(200);
    expect(userSchema.parse(me.body).role).toBe('inspector');
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'inspector@northbean.example', password: 'wrong' })
      .expect(401)
      .expect(({ body }) =>
        expect(body.message.code ?? body.code).toBe('UNAUTHENTICATED'),
      );
    await request(app.getHttpServer()).get('/me').expect(401);
    const expiredToken = new JwtService({
      secret: process.env.JWT_SECRET,
    }).sign({ id: '00000000-0000-0000-0000-000000000001' }, { expiresIn: -1 });
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/inspections/${otherSiteInspectionId}`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/dashboard/sites')
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/evidence/${otherSiteEvidenceId}`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/inspections/${inspectionId}/review`)
      .set('Authorization', `Bearer ${hqToken}`)
      .send({ action: 'approve' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/inspections/${inspectionId}/review`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ action: 'approve' })
      .expect(403);
  });

  it('exposes every contracted endpoint with a schema-shaped response', async () => {
    const routes = [
      request(app.getHttpServer())
        .get('/inspector/today')
        .set('Authorization', `Bearer ${inspectorToken}`),
      request(app.getHttpServer())
        .post('/inspections')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ templateId: '00000000-0000-0000-0000-000000000001' }),
      request(app.getHttpServer())
        .get(`/inspections/${inspectionId}`)
        .set('Authorization', `Bearer ${inspectorToken}`),
      request(app.getHttpServer())
        .patch(
          `/inspections/${inspectionId}/items/00000000-0000-0000-0000-000000000002`,
        )
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ result: 'pass' }),
      request(app.getHttpServer())
        .post(
          `/inspections/${inspectionId}/items/00000000-0000-0000-0000-000000000002/evidence`,
        )
        .set('Authorization', `Bearer ${inspectorToken}`),
      request(app.getHttpServer())
        .get(`/evidence/${evidenceId}`)
        .set('Authorization', `Bearer ${inspectorToken}`),
      request(app.getHttpServer())
        .post(`/inspections/${inspectionId}/submit`)
        .set('Authorization', `Bearer ${inspectorToken}`),
      request(app.getHttpServer())
        .get('/review/queue')
        .set('Authorization', `Bearer ${supervisorToken}`),
      request(app.getHttpServer())
        .post(`/inspections/${inspectionId}/review`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ action: 'start' }),
      request(app.getHttpServer())
        .get('/dashboard/sites')
        .set('Authorization', `Bearer ${supervisorToken}`),
    ];
    const responses = await Promise.all(routes);
    expect(responses[0].status).toBe(200);
    todayResponseSchema.parse(responses[0].body);
    expect(responses[1].status).toBe(201);
    inspectionSchema.parse(responses[1].body);
    expect(responses[2].status).toBe(200);
    inspectionDetailSchema.parse(responses[2].body);
    expect(responses[3].status).toBe(200);
    updateInspectionItemRequestSchema.parse(responses[3].body);
    expect(responses[4].status).toBe(201);
    evidenceSchema.parse(responses[4].body);
    expect(responses[5].status).toBe(200);
    signedEvidenceResponseSchema.parse(responses[5].body);
    expect(responses[6].status).toBe(201);
    submitInspectionResponseSchema.parse(responses[6].body);
    expect(responses[7].status).toBe(200);
    reviewQueueResponseSchema.parse(responses[7].body);
    expect(responses[8].status).toBe(201);
    reviewRequestSchema.parse(responses[8].body);
    expect(responses[9].status).toBe(200);
    dashboardSitesResponseSchema.parse(responses[9].body);
  });
});
