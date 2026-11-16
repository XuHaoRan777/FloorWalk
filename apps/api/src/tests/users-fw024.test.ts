import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../app.module.js';
import { HttpErrorFilter } from '../filters/http-exception.filter.js';
import { createPool } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { seedDatabase } from '../db/seed.js';

describe('two-role user management (FW-024)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let adminCookie: string;
  let managerCookie: string;
  let siteId: string;
  let otherSiteId: string;
  let foreignSiteId: string;
  let adminId: string;
  const created: string[] = [];
  const login = async (loginName: string) => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({ loginName, password: 'northbean-demo' })
      .expect(201);
    return (response.headers['set-cookie'] as unknown as string[])[0].split(
      ';',
    )[0];
  };
  const create = (body: object, cookie = adminCookie) =>
    request(app.getHttpServer())
      .post('/api/admin/users')
      .set('Cookie', cookie)
      .send(body);
  const patch = (id: string, body: object, cookie = adminCookie) =>
    request(app.getHttpServer())
      .patch(`/api/admin/users/${id}`)
      .set('Cookie', cookie)
      .send(body);

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    pool = createPool();
    const sites = await pool.query<{ id: string; code: string }>(
      "SELECT id, code FROM floorwalk.sites WHERE code IN ('NB-001', 'NB-002', 'DEMO2-001')",
    );
    siteId = sites.rows.find((s) => s.code === 'NB-001')!.id;
    otherSiteId = sites.rows.find((s) => s.code === 'NB-002')!.id;
    foreignSiteId = sites.rows.find((s) => s.code === 'DEMO2-001')!.id;
    adminId = (
      await pool.query(
        "SELECT id FROM floorwalk.users WHERE login_name = 'hq@northbean.example'",
      )
    ).rows[0].id;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
    adminCookie = await login('hq@northbean.example');
    managerCookie = await login('manager2@northbean.example');
  }, 60000);

  afterAll(async () => {
    try {
      await pool.query(
        'DELETE FROM floorwalk.sessions WHERE user_id = ANY($1::uuid[])',
        [created],
      );
      await pool.query(
        'DELETE FROM floorwalk.users WHERE id = ANY($1::uuid[])',
        [created],
      );
    } finally {
      await pool.end();
      await app.close();
    }
  });

  it('creates a manager and validates account and site boundaries', async () => {
    const loginName = `fw024-${randomUUID()}@example.test`;
    const input = {
      loginName,
      displayName: '测试店长',
      role: 'store_manager',
      siteId,
      password: 'initial-password',
    };
    const response = await create(input).expect(201);
    created.push(response.body.id);
    expect(response.body).toMatchObject({
      loginName,
      role: 'store_manager',
      siteId,
      mustChangePassword: true,
    });
    const stored = await pool.query(
      'SELECT password_hash FROM floorwalk.users WHERE id = $1',
      [response.body.id],
    );
    expect(
      await argon2.verify(stored.rows[0].password_hash, input.password),
    ).toBe(true);
    await create(input).expect(409);
    await create({ ...input, loginName: 'invalid' }).expect(400);
    await create({
      ...input,
      loginName: `new-${loginName}`,
      siteId: foreignSiteId,
    }).expect(404);
    await create({
      ...input,
      loginName: `new-${loginName}`,
      siteId: undefined,
    }).expect(400);
    await create({
      ...input,
      loginName: `new-${loginName}`,
      password: 'short',
    }).expect(400);
    await create({
      ...input,
      loginName: `new-${loginName}`,
      role: 'admin',
    }).expect(403);
    await create(
      { ...input, loginName: `new-${loginName}` },
      managerCookie,
    ).expect(403);
    await patch(
      response.body.id,
      { displayName: '改名' },
      managerCookie,
    ).expect(403);
    await patch(response.body.id, {
      displayName: '改名',
      siteId: otherSiteId,
    }).expect(200);
    await patch(response.body.id, { siteId: foreignSiteId }).expect(404);
    await patch(adminId, { disabled: true }).expect(409);
  });

  it('lists store managers and removes supervisor assignment', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/sites')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(
      response.body.find((site: { id: string }) => site.id === siteId)
        .storeManagers,
    ).toHaveLength(2);
    await request(app.getHttpServer())
      .put(`/api/admin/sites/${siteId}/supervisor`)
      .set('Cookie', adminCookie)
      .send({ userId: null })
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Cookie', managerCookie)
      .expect(403);
  });
});
