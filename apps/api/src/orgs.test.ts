import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import argon2 from 'argon2';
import {
  createOrgResponseSchema,
  errorResponseSchema,
  loginResponseSchema,
} from '@libs/shared';
import { AppModule } from './app.module.js';
import { hashSessionId } from './auth.js';
import { HttpErrorFilter } from './http-exception.filter.js';
import { createPool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';

describe('organization registration (FW-019 AC-01)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  const orgName = `FW019-${randomUUID()}`;
  const createdOrgIds: string[] = [];
  const sessionHashes: string[] = [];
  const input = () => ({
    orgName,
    adminName: '注册管理员',
    email: `fw019-${randomUUID()}@example.test`,
    password: 'registration-password',
  });
  const cookieFrom = (response: request.Response) =>
    (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

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
  }, 60000);

  afterAll(async () => {
    try {
      await pool.query(
        'DELETE FROM floorwalk.sessions WHERE token_hash = ANY($1::text[])',
        [sessionHashes],
      );
      await pool.query(
        'DELETE FROM floorwalk.users WHERE org_id = ANY($1::uuid[])',
        [createdOrgIds],
      );
      await pool.query(
        'DELETE FROM floorwalk.organizations WHERE id = ANY($1::uuid[]) OR name = $2',
        [createdOrgIds, orgName],
      );
    } finally {
      await pool.end();
      await app.close();
    }
  });

  it('creates only the organization and admin with a usable session and default timezone', async () => {
    const registration = input();
    const response = await request(app.getHttpServer())
      .post('/api/orgs')
      .send(registration)
      .expect(201);
    createdOrgIds.push(response.body.org.id);
    const { org, user } = createOrgResponseSchema.parse(response.body);
    expect(org).toMatchObject({ name: orgName, timezone: 'Asia/Shanghai' });
    expect(user).toMatchObject({
      email: registration.email,
      displayName: registration.adminName,
      role: 'admin',
      org: { id: org.id, name: orgName },
      siteId: null,
      mustChangePassword: false,
    });
    expect(Object.keys(response.body)).toEqual(['org', 'user']);
    const cookieHeader = (
      response.headers['set-cookie'] as unknown as string[]
    )[0];
    expect(cookieHeader.includes('; HttpOnly')).toBe(true);
    expect(cookieHeader.includes('; SameSite=Strict')).toBe(true);
    expect(cookieHeader.includes('; Path=/api')).toBe(true);
    const cookie = cookieFrom(response);
    const sessionHash = hashSessionId(cookie.slice('fw_session='.length));
    sessionHashes.push(sessionHash);
    const session = await pool.query<{ user_id: string }>(
      'SELECT user_id FROM floorwalk.sessions WHERE token_hash = $1',
      [sessionHash],
    );
    expect(session.rows).toEqual([{ user_id: user.id }]);
    const stored = await pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM floorwalk.users WHERE id = $1',
      [user.id],
    );
    expect(
      await argon2.verify(stored.rows[0].password_hash, registration.password),
    ).toBe(true);
    const data = await pool.query<{
      users: string;
      sites: string;
      templates: string;
    }>(
      `SELECT
         (SELECT count(*) FROM floorwalk.users WHERE org_id = $1)::text AS users,
         (SELECT count(*) FROM floorwalk.sites WHERE org_id = $1)::text AS sites,
         (SELECT count(*) FROM floorwalk.templates WHERE org_id = $1)::text AS templates`,
      [org.id],
    );
    expect(data.rows).toEqual([{ users: '1', sites: '0', templates: '0' }]);
    const me = await request(app.getHttpServer())
      .get('/api/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(me.body).toEqual(user);
    const login = await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({ email: registration.email, password: registration.password })
      .expect(201);
    expect(loginResponseSchema.parse(login.body).user).toEqual(user);
  });

  it.each(['hq@northbean.example', 'admin@demo2.example'])(
    'rejects the globally existing email %s without leaving an organization',
    async (email) => {
      const before = await pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM floorwalk.organizations WHERE name = $1',
        [orgName],
      );
      const response = await request(app.getHttpServer())
        .post('/api/orgs')
        .send({ ...input(), email })
        .expect(409);
      expect(errorResponseSchema.parse(response.body)).toEqual({
        code: 'INVALID_STATE',
        message: '该邮箱已被注册。',
      });
      expect(response.headers['set-cookie']).toBeUndefined();
      const after = await pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM floorwalk.organizations WHERE name = $1',
        [orgName],
      );
      expect(after.rows).toEqual(before.rows);
    },
  );

  it.each([
    { password: 'short' },
    { orgName: '   ' },
    { email: 'invalid-email' },
  ])('rejects invalid registration %j', async (invalid) => {
    const response = await request(app.getHttpServer())
      .post('/api/orgs')
      .send({ ...input(), ...invalid })
      .expect(400);
    expect(errorResponseSchema.parse(response.body).code).toBe(
      'VALIDATION_FAILED',
    );
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('registers a new organization while logged in without changing the original organization or session', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({ email: 'hq@northbean.example', password: 'northbean-demo' })
      .expect(201);
    const originalUser = loginResponseSchema.parse(login.body).user;
    const originalCookie = cookieFrom(login);
    const originalHash = hashSessionId(
      originalCookie.slice('fw_session='.length),
    );
    sessionHashes.push(originalHash);
    const snapshot = () =>
      pool.query(
        `SELECT
         (SELECT jsonb_agg(to_jsonb(o)) FROM floorwalk.organizations o WHERE id = $1) AS org,
         (SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM floorwalk.users u WHERE org_id = $1) AS users,
         (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM floorwalk.sites s WHERE org_id = $1) AS sites,
         (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM floorwalk.templates t WHERE org_id = $1) AS templates`,
        [originalUser.org.id],
      );
    const before = await snapshot();
    const response = await request(app.getHttpServer())
      .post('/api/orgs')
      .set('Cookie', originalCookie)
      .send({ ...input(), timezone: 'Europe/London' })
      .expect(201);
    createdOrgIds.push(response.body.org.id);
    const { org, user } = createOrgResponseSchema.parse(response.body);
    expect(org.id === originalUser.org.id).toBe(false);
    expect(org.timezone).toBe('Europe/London');
    expect((await snapshot()).rows).toEqual(before.rows);
    const originalMe = await request(app.getHttpServer())
      .get('/api/me')
      .set('Cookie', originalCookie)
      .expect(200);
    expect(originalMe.body).toEqual(originalUser);
    const newMe = await request(app.getHttpServer())
      .get('/api/me')
      .set('Cookie', cookieFrom(response))
      .expect(200);
    expect(newMe.body).toEqual(user);
  });
});
