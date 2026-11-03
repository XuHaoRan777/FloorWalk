import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import { adminUserSchema, errorResponseSchema } from '@libs/shared';
import { AppModule } from './app.module.js';
import { hashSessionId } from './auth.js';
import { HttpErrorFilter } from './http-exception.filter.js';
import { createPool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';

describe('admin user management (FW-020 AC-01/03/04)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let adminCookie: string;
  let supervisorCookie: string;
  let siteId: string;
  let foreignSiteId: string;
  let adminId: string;
  let supervisorId: string;
  const createdUserIds: string[] = [];
  const sessionHashes: string[] = [];
  const newEmail = () => `fw020-${randomUUID()}@example.test`;
  const cookieFrom = (response: request.Response) => {
    const cookie = (
      response.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];
    sessionHashes.push(hashSessionId(cookie.slice('fw_session='.length)));
    return cookie;
  };
  const login = async (email: string, password = 'northbean-demo') => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({ email, password })
      .expect(201);
    return cookieFrom(response);
  };
  const create = (cookie: string, input: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/admin/users')
      .set('Cookie', cookie)
      .send(input);
  const patchUser = (id: string, cookie = adminCookie) =>
    request(app.getHttpServer())
      .patch('/api/admin/users/' + id)
      .set('Cookie', cookie);

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    pool = createPool();
    const rows = await pool.query<{ id: string; code: string }>(
      "SELECT id, code FROM floorwalk.sites WHERE code IN ('NB-001', 'DEMO2-001')",
    );
    siteId = rows.rows.find((row) => row.code === 'NB-001')!.id;
    foreignSiteId = rows.rows.find((row) => row.code === 'DEMO2-001')!.id;
    const identities = await pool.query<{ id: string; role: string }>(
      "SELECT id, role FROM floorwalk.users WHERE email IN ('hq@northbean.example', 'supervisor@northbean.example')",
    );
    adminId = identities.rows.find((row) => row.role === 'admin')!.id;
    supervisorId = identities.rows.find((row) => row.role === 'supervisor')!.id;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
    adminCookie = await login('hq@northbean.example');
    supervisorCookie = await login('supervisor@northbean.example');
  }, 60000);

  afterAll(async () => {
    try {
      await pool.query(
        'DELETE FROM floorwalk.sessions WHERE token_hash = ANY($1::text[])',
        [sessionHashes],
      );
      await pool.query(
        'DELETE FROM floorwalk.users WHERE id = ANY($1::uuid[])',
        [createdUserIds],
      );
    } finally {
      await pool.end();
      await app.close();
    }
  });

  it('creates an inspector with a hashed initial password and rejects invalid inputs', async () => {
    const email = newEmail();
    const response = await create(adminCookie, {
      email,
      displayName: '测试店员',
      role: 'inspector',
      siteId,
      password: 'initial-password',
    }).expect(201);
    const user = adminUserSchema.parse(response.body);
    createdUserIds.push(user.id);
    expect(user).toMatchObject({
      email,
      role: 'inspector',
      siteId,
      mustChangePassword: true,
      disabled: false,
    });
    const stored = await pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM floorwalk.users WHERE id = $1',
      [user.id],
    );
    expect(
      await argon2.verify(stored.rows[0].password_hash, 'initial-password'),
    ).toBe(true);
    const missingSite = await create(adminCookie, {
      email: newEmail(),
      displayName: '无门店店员',
      role: 'inspector',
      password: 'initial-password',
    }).expect(400);
    expect(errorResponseSchema.parse(missingSite.body).code).toBe(
      'VALIDATION_FAILED',
    );
    const shortPassword = await create(adminCookie, {
      email: newEmail(),
      displayName: '短密码店员',
      role: 'inspector',
      siteId,
      password: 'short',
    }).expect(400);
    expect(errorResponseSchema.parse(shortPassword.body).code).toBe(
      'VALIDATION_FAILED',
    );
    const foreignSite = await create(adminCookie, {
      email: newEmail(),
      displayName: '外商家店员',
      role: 'inspector',
      siteId: foreignSiteId,
      password: 'initial-password',
    }).expect(404);
    expect(errorResponseSchema.parse(foreignSite.body).code).toBe('NOT_FOUND');
    const duplicate = await create(adminCookie, {
      email,
      displayName: '重复账号',
      role: 'inspector',
      siteId,
      password: 'initial-password',
    }).expect(409);
    expect(errorResponseSchema.parse(duplicate.body).code).toBe(
      'INVALID_STATE',
    );
  });

  it('limits supervisors to creating inspectors at their assigned sites', async () => {
    const response = await create(supervisorCookie, {
      email: newEmail(),
      displayName: '主管创建店员',
      role: 'inspector',
      siteId,
      password: 'initial-password',
    }).expect(201);
    createdUserIds.push(adminUserSchema.parse(response.body).id);
    const forbiddenRole = await create(supervisorCookie, {
      email: newEmail(),
      displayName: '主管创建管理员',
      role: 'admin',
      password: 'initial-password',
    }).expect(403);
    expect(errorResponseSchema.parse(forbiddenRole.body).code).toBe(
      'FORBIDDEN',
    );
    const otherSite = await pool.query<{ id: string }>(
      "SELECT id FROM floorwalk.sites WHERE code = 'NB-007'",
    );
    const notAssigned = await create(supervisorCookie, {
      email: newEmail(),
      displayName: '非名下门店店员',
      role: 'inspector',
      siteId: otherSite.rows[0].id,
      password: 'initial-password',
    }).expect(403);
    expect(errorResponseSchema.parse(notAssigned.body).code).toBe('FORBIDDEN');
  });

  it('rechecks supervisor assignment after waiting for a concurrent reassignment', async () => {
    const blocker = await pool.connect();
    let pending: Promise<request.Response> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query(
        'SELECT id FROM floorwalk.sites WHERE id = $1 FOR UPDATE',
        [siteId],
      );
      const owner = await blocker.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      pending = create(supervisorCookie, {
        email: newEmail(),
        displayName: '指派变更中的店员',
        role: 'inspector',
        siteId,
        password: 'initial-password',
      }).then((response) => response);
      await expect
        .poll(async () => {
          const waiting = await pool.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM pg_stat_activity
             WHERE datname = current_database()
               AND $1 = ANY(pg_blocking_pids(pid))
               AND query LIKE '%FROM floorwalk.sites%FOR UPDATE%'`,
            [owner.rows[0].pid],
          );
          return Number(waiting.rows[0].count);
        })
        .toBe(1);
      await blocker.query(
        'DELETE FROM floorwalk.site_supervisors WHERE site_id = $1',
        [siteId],
      );
      await blocker.query('COMMIT');
      const denied = await pending;
      expect(denied.status).toBe(403);
      expect(errorResponseSchema.parse(denied.body).code).toBe('FORBIDDEN');
    } finally {
      await blocker.query('ROLLBACK');
      await pending;
      await pool.query(
        `INSERT INTO floorwalk.site_supervisors (site_id, user_id)
         VALUES ($1, $2) ON CONFLICT (site_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
        [siteId, supervisorId],
      );
      blocker.release();
    }
  });

  it('disables users by revoking every session, blocks login, then allows re-enable', async () => {
    const created = await create(adminCookie, {
      email: newEmail(),
      displayName: '停用测试',
      role: 'inspector',
      siteId,
      password: 'initial-password',
    }).expect(201);
    const user = adminUserSchema.parse(created.body);
    createdUserIds.push(user.id);
    const firstCookie = await login(user.email, 'initial-password');
    const secondCookie = await login(user.email, 'initial-password');
    await patchUser(user.id).send({ disabled: true }).expect(200);
    await request(app.getHttpServer())
      .get('/api/me')
      .set('Cookie', firstCookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({ email: user.email, password: 'initial-password' })
      .expect(401);
    const hashes = [firstCookie, secondCookie].map((cookie) =>
      hashSessionId(cookie.slice('fw_session='.length)),
    );
    const sessionRows = await pool.query<{ revoked_at: Date | null }>(
      'SELECT revoked_at FROM floorwalk.sessions WHERE token_hash = ANY($1::text[])',
      [hashes],
    );
    expect(sessionRows.rows).toHaveLength(2);
    expect(
      sessionRows.rows.every((row) => row.revoked_at instanceof Date),
    ).toBe(true);
    await patchUser(user.id).send({ disabled: false }).expect(200);
    await login(user.email, 'initial-password');
  });

  it('rejects supervisor access outside assigned inspector accounts and hides other organizations', async () => {
    const otherInspector = await pool.query<{ id: string }>(
      "SELECT id FROM floorwalk.users WHERE email = 'inspector+nb-007@northbean.example'",
    );
    const forbidden = await patchUser(
      otherInspector.rows[0].id,
      supervisorCookie,
    )
      .send({ disabled: true })
      .expect(403);
    expect(errorResponseSchema.parse(forbidden.body).code).toBe('FORBIDDEN');
    const otherAdmin = await pool.query<{ id: string }>(
      "SELECT id FROM floorwalk.users WHERE email = 'admin@demo2.example'",
    );
    const hidden = await patchUser(otherAdmin.rows[0].id)
      .send({ disabled: true })
      .expect(404);
    expect(errorResponseSchema.parse(hidden.body).code).toBe('NOT_FOUND');
    const lastAdmin = await patchUser(adminId)
      .send({ disabled: true })
      .expect(409);
    expect(errorResponseSchema.parse(lastAdmin.body).code).toBe(
      'INVALID_STATE',
    );
    const localSupervisor = await pool.query<{ id: string }>(
      "SELECT id FROM floorwalk.users WHERE role = 'supervisor' AND org_id = (SELECT org_id FROM floorwalk.users WHERE id = $1) LIMIT 1",
      [adminId],
    );
    for (const id of [adminId, localSupervisor.rows[0].id]) {
      const denied = await patchUser(id, supervisorCookie)
        .send({ disabled: true })
        .expect(403);
      expect(errorResponseSchema.parse(denied.body).code).toBe('FORBIDDEN');
    }
  });

  it('resets a password, requires the next login to change it, and revokes all sessions', async () => {
    const created = await create(adminCookie, {
      email: newEmail(),
      displayName: '重置测试',
      role: 'inspector',
      siteId,
      password: 'initial-password',
    }).expect(201);
    const user = adminUserSchema.parse(created.body);
    createdUserIds.push(user.id);
    const firstCookie = await login(user.email, 'initial-password');
    const secondCookie = await login(user.email, 'initial-password');
    const reset = await request(app.getHttpServer())
      .post('/api/admin/users/' + user.id + '/password')
      .set('Cookie', adminCookie)
      .send({ password: 'reset-password' })
      .expect(204);
    expect(reset.text).toBe('');
    const stored = await pool.query<{
      password_hash: string;
      must_change_password: boolean;
    }>(
      'SELECT password_hash, must_change_password FROM floorwalk.users WHERE id = $1',
      [user.id],
    );
    expect(
      await argon2.verify(stored.rows[0].password_hash, 'reset-password'),
    ).toBe(true);
    expect(stored.rows[0].must_change_password).toBe(true);
    for (const cookie of [firstCookie, secondCookie])
      await request(app.getHttpServer())
        .get('/api/me')
        .set('Cookie', cookie)
        .expect(401);
    await request(app.getHttpServer())
      .post('/api/me/password')
      .set('Cookie', firstCookie)
      .send({
        currentPassword: 'initial-password',
        newPassword: 'stale-session-password',
      })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({ email: user.email, password: 'initial-password' })
      .expect(401);
    const newCookie = await login(user.email, 'reset-password');
    const blocked = await request(app.getHttpServer())
      .get('/api/inspector/today')
      .set('Cookie', newCookie)
      .expect(403);
    expect(errorResponseSchema.parse(blocked.body).code).toBe('FORBIDDEN');
    await request(app.getHttpServer())
      .get('/api/me')
      .set('Cookie', newCookie)
      .expect(200);
  });

  it('does not let an in-flight password change overwrite an administrator reset', async () => {
    const created = await create(adminCookie, {
      email: newEmail(),
      displayName: '并发重置测试',
      role: 'inspector',
      siteId,
      password: 'initial-password',
    }).expect(201);
    const user = adminUserSchema.parse(created.body);
    createdUserIds.push(user.id);
    const cookie = await login(user.email, 'initial-password');
    const tokenHash = hashSessionId(cookie.slice('fw_session='.length));
    const blocker = await pool.connect();
    let pending: Promise<request.Response> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query(
        'SELECT id FROM floorwalk.users WHERE id = $1 FOR UPDATE',
        [user.id],
      );
      const owner = await blocker.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      await blocker.query(
        `UPDATE floorwalk.users
         SET password_hash = $2, must_change_password = true WHERE id = $1`,
        [user.id, await argon2.hash('reset-password')],
      );
      pending = request(app.getHttpServer())
        .post('/api/me/password')
        .set('Cookie', cookie)
        .send({
          currentPassword: 'initial-password',
          newPassword: 'stale-change-password',
        })
        .then((response) => response);
      await expect
        .poll(async () => {
          const waiting = await pool.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM pg_stat_activity
             WHERE datname = current_database()
               AND $1 = ANY(pg_blocking_pids(pid))
               AND query LIKE '%FROM floorwalk.users%FOR UPDATE%'`,
            [owner.rows[0].pid],
          );
          return Number(waiting.rows[0].count);
        })
        .toBe(1);
      await blocker.query(
        'UPDATE floorwalk.sessions SET revoked_at = now() WHERE token_hash = $1',
        [tokenHash],
      );
      await blocker.query('COMMIT');
      expect((await pending).status).toBe(401);
      const state = await pool.query<{
        password_hash: string;
        must_change_password: boolean;
      }>(
        'SELECT password_hash, must_change_password FROM floorwalk.users WHERE id = $1',
        [user.id],
      );
      expect(
        await argon2.verify(state.rows[0].password_hash, 'reset-password'),
      ).toBe(true);
      expect(state.rows[0].must_change_password).toBe(true);
    } finally {
      await blocker.query('ROLLBACK');
      await pending;
      blocker.release();
    }
  });

  it('changes the initial password, retains this session, and revokes others', async () => {
    const created = await create(adminCookie, {
      email: newEmail(),
      displayName: '首次改密测试',
      role: 'inspector',
      siteId,
      password: 'initial-password',
    }).expect(201);
    const user = adminUserSchema.parse(created.body);
    createdUserIds.push(user.id);
    const currentCookie = await login(user.email, 'initial-password');
    const otherCookie = await login(user.email, 'initial-password');

    await request(app.getHttpServer())
      .get('/api/inspector/today')
      .set('Cookie', currentCookie)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/me')
      .set('Cookie', currentCookie)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/me/password')
      .set('Cookie', currentCookie)
      .send({
        currentPassword: 'wrong-password',
        newPassword: 'changed-password',
      })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/me/password')
      .set('Cookie', currentCookie)
      .send({ currentPassword: 'initial-password', newPassword: 'short' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/me/password')
      .set('Cookie', currentCookie)
      .send({
        currentPassword: 'initial-password',
        newPassword: 'initial-password',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/me/password')
      .set('Cookie', currentCookie)
      .send({
        currentPassword: 'initial-password',
        newPassword: 'changed-password',
      })
      .expect(204);

    await request(app.getHttpServer())
      .get('/api/inspector/today')
      .set('Cookie', currentCookie)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/me')
      .set('Cookie', otherCookie)
      .expect(401);
    const state = await pool.query<{ must_change_password: boolean }>(
      'SELECT must_change_password FROM floorwalk.users WHERE id = $1',
      [user.id],
    );
    expect(state.rows[0].must_change_password).toBe(false);
    await login(user.email, 'changed-password');
  });
});
