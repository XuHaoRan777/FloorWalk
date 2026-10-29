import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { loginResponseSchema, siteResponseSchema } from '@libs/shared';
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
});
