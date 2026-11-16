import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import argon2 from 'argon2';
import { errorResponseSchema, loginResponseSchema } from '@libs/shared';
import { AppModule } from '../app.module.js';
import { HttpErrorFilter } from '../filters/http-exception.filter.js';
import { createPool } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { seedDatabase } from '../db/seed.js';

describe('HttpOnly sessions', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  const initialNodeEnv = process.env.NODE_ENV;
  const temporaryUsers: string[] = [];
  const hash = (value: string) =>
    createHash('sha256').update(value).digest('hex');
  const login = () =>
    request(app.getHttpServer()).post('/api/auth/session').send({
      loginName: 'hq@northbean.example',
      password: 'northbean-demo',
    });
  const cookieFrom = (response: request.Response) =>
    (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  const unauthenticated = async (cookie?: string, bearer?: string) => {
    const call = request(app.getHttpServer()).get('/api/me');
    if (cookie) call.set('Cookie', cookie);
    if (bearer) call.set('Authorization', `Bearer ${bearer}`);
    const response = await call.expect(401);
    expect(errorResponseSchema.parse(response.body).code).toBe(
      'UNAUTHENTICATED',
    );
  };
  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    pool = createPool();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.enableCors({ origin: true, credentials: true });
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
  }, 60000);

  afterAll(async () => {
    if (initialNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = initialNodeEnv;
    try {
      await pool.query('DELETE FROM floorwalk.sessions');
      await pool.query(
        'DELETE FROM floorwalk.users WHERE id = ANY($1::uuid[])',
        [temporaryUsers],
      );
    } finally {
      await pool.end();
      await app.close();
    }
  });

  it('stores only the SHA-256 of a random 32-byte ID with a seven-day idle window', async () => {
    const response = await login().expect(201);
    const body = loginResponseSchema.parse(response.body);
    expect(Object.keys(response.body)).toEqual(['user']);
    const rawId = cookieFrom(response).slice('fw_session='.length);
    expect(Buffer.from(rawId, 'base64url').length).toBe(32);
    const result = await pool.query<{
      id: string;
      token_hash: string;
      user_id: string;
      created_at: Date;
      expires_at: Date;
      last_seen_at: Date;
      revoked_at: Date | null;
    }>('SELECT * FROM floorwalk.sessions WHERE token_hash = $1', [hash(rawId)]);
    expect(result.rows).toHaveLength(1);
    const session = result.rows[0];
    expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.token_hash).toBe(hash(rawId));
    expect('user' in body && session.user_id === body.user.id).toBe(true);
    expect(session.revoked_at).toBeNull();
    expect(
      Math.abs(
        session.expires_at.getTime() - session.created_at.getTime() - 604800000,
      ),
    ).toBeLessThan(1000);
    const next = await login().expect(201);
    expect(cookieFrom(next) === cookieFrom(response)).toBe(false);
  });

  it.each(['development', 'production'])(
    'sets all cookie attributes in %s',
    async (nodeEnv) => {
      try {
        process.env.NODE_ENV = nodeEnv;
        const response = await login().expect(201);
        const header = (
          response.headers['set-cookie'] as unknown as string[]
        )[0];
        expect(/^fw_session=/.test(header)).toBe(true);
        expect(/; HttpOnly(?:;|$)/i.test(header)).toBe(true);
        expect(/; SameSite=Strict(?:;|$)/i.test(header)).toBe(true);
        expect(/; Path=\/api(?:;|$)/i.test(header)).toBe(true);
        expect(/; Max-Age=604800(?:;|$)/i.test(header)).toBe(true);
        expect(/; Secure(?:;|$)/i.test(header)).toBe(nodeEnv === 'production');
      } finally {
        if (initialNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = initialNodeEnv;
      }
    },
  );

  it('rejects a wrong password without storing a session or setting a cookie', async () => {
    const before = await pool.query(
      'SELECT COUNT(*)::int AS count FROM floorwalk.sessions',
    );
    const response = await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({
        loginName: 'hq@northbean.example',
        password: 'wrong-password',
      })
      .expect(401);
    expect(errorResponseSchema.parse(response.body).code).toBe(
      'UNAUTHENTICATED',
    );
    expect(response.headers['set-cookie'] === undefined).toBe(true);
    const after = await pool.query(
      'SELECT COUNT(*)::int AS count FROM floorwalk.sessions',
    );
    expect(after.rows).toEqual(before.rows);
  });

  it('does not create a session from a password reset during login', async () => {
    const blocker = await pool.connect();
    let pending: Promise<request.Response> | undefined;
    let originalHash: string | undefined;
    try {
      await blocker.query('BEGIN');
      const user = await blocker.query<{ id: string; password_hash: string }>(
        "SELECT id, password_hash FROM floorwalk.users WHERE login_name = 'hq@northbean.example' FOR UPDATE",
      );
      originalHash = user.rows[0].password_hash;
      const owner = await blocker.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      await blocker.query(
        'UPDATE floorwalk.users SET password_hash = $2 WHERE id = $1',
        [user.rows[0].id, await argon2.hash('reset-password')],
      );
      pending = login().then((response) => response);
      await expect
        .poll(async () => {
          const waiting = await pool.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM pg_stat_activity
           WHERE datname = current_database() AND $1 = ANY(pg_blocking_pids(pid))
             AND query LIKE '%FROM floorwalk.users%FOR UPDATE%'`,
            [owner.rows[0].pid],
          );
          return Number(waiting.rows[0].count);
        })
        .toBe(1);
      await blocker.query('COMMIT');
      const response = await pending;
      expect(response.status).toBe(401);
      expect(response.headers['set-cookie']).toBeUndefined();
    } finally {
      await blocker.query('ROLLBACK');
      await pending;
      if (originalHash)
        await pool.query(
          "UPDATE floorwalk.users SET password_hash = $1 WHERE login_name = 'hq@northbean.example'",
          [originalHash],
        );
      blocker.release();
    }
  });

  it('requires an organization selection for matching accounts without creating a session', async () => {
    const loginName = 'inspector@northbean.example';
    const before = await pool.query('SELECT count(*) FROM floorwalk.sessions');
    const selection = await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({ loginName, password: 'northbean-demo' })
      .expect(201);
    expect(selection.headers['set-cookie']).toBeUndefined();
    expect(selection.body.organizations).toHaveLength(2);
    expect(
      (await pool.query('SELECT count(*) FROM floorwalk.sessions')).rows,
    ).toEqual(before.rows);
    const chosen = selection.body.organizations[1];
    const response = await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({ loginName, password: 'northbean-demo', orgId: chosen.id })
      .expect(201);
    expect(response.body.user.org.id).toBe(chosen.id);
    expect(response.headers['set-cookie']).toBeDefined();
    await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({ loginName, password: 'northbean-demo', orgId: randomUUID() })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({ loginName, password: 'incorrect' })
      .expect(401);
  });

  it('rejects a request with no cookie', async () => {
    await unauthenticated();
  });

  it('rejects an unknown session ID', async () => {
    await unauthenticated(
      `fw_session=${randomBytes(32).toString('base64url')}`,
    );
  });

  it('rejects a session idle for more than seven days', async () => {
    const cookie = cookieFrom(await login().expect(201));
    await pool.query(
      "UPDATE floorwalk.sessions SET last_seen_at = NOW() - INTERVAL '7 days 1 second' WHERE token_hash = $1",
      [hash(cookie.slice('fw_session='.length))],
    );
    await unauthenticated(cookie);
  });

  it('refreshes activity and cookie while ignoring the retained expires_at column', async () => {
    const cookie = cookieFrom(await login().expect(201));
    const tokenHash = hash(cookie.slice('fw_session='.length));
    await pool.query(
      "UPDATE floorwalk.sessions SET last_seen_at = now() - interval '6 days', expires_at = now() - interval '1 hour' WHERE token_hash = $1",
      [tokenHash],
    );
    const response = await request(app.getHttpServer())
      .get('/api/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(response.headers['set-cookie'][0]).toContain('Max-Age=604800');
    const result = await pool.query(
      "SELECT now() - last_seen_at < interval '1 minute' AS refreshed FROM floorwalk.sessions WHERE token_hash = $1",
      [tokenHash],
    );
    expect(result.rows[0].refreshed).toBe(true);
  });

  it('rejects a revoked session', async () => {
    const cookie = cookieFrom(await login().expect(201));
    await pool.query(
      'UPDATE floorwalk.sessions SET revoked_at = NOW() WHERE token_hash = $1',
      [hash(cookie.slice('fw_session='.length))],
    );
    await unauthenticated(cookie);
  });

  it('rejects a session after its user has been deleted and cascades all their sessions', async () => {
    const created = await pool.query<{ id: string }>(
      `INSERT INTO floorwalk.users (login_name, password_hash, display_name, role, org_id, site_id)
       SELECT 'session-deleted@northbean.example', password_hash, 'Session test', 'store_manager', org_id, site_id
       FROM floorwalk.users WHERE login_name = 'manager2@northbean.example' RETURNING id`,
    );
    const userId = created.rows[0].id;
    temporaryUsers.push(userId);
    const cookies: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/auth/session')
        .send({
          loginName: 'session-deleted@northbean.example',
          password: 'northbean-demo',
        })
        .expect(201);
      cookies.push(cookieFrom(response));
    }
    const before = await pool.query(
      'SELECT id FROM floorwalk.sessions WHERE user_id = $1',
      [userId],
    );
    expect(before.rows).toHaveLength(2);
    await pool.query('DELETE FROM floorwalk.users WHERE id = $1', [userId]);
    const after = await pool.query(
      'SELECT id FROM floorwalk.sessions WHERE user_id = $1',
      [userId],
    );
    expect(after.rows).toHaveLength(0);
    for (const cookie of cookies) await unauthenticated(cookie);
  });

  it('does not accept a Bearer credential without the session cookie', async () => {
    const cookie = cookieFrom(await login().expect(201));
    await unauthenticated(undefined, cookie.slice('fw_session='.length));
  });

  it('removes the old JWT login endpoint', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        loginName: 'hq@northbean.example',
        password: 'northbean-demo',
      })
      .expect(404);
  });

  it('creates the specified session columns, keys, and user index in the migration', async () => {
    const columns = await pool.query<{
      column_name: string;
      is_nullable: string;
    }>(
      `SELECT column_name, is_nullable FROM information_schema.columns
       WHERE table_schema = 'floorwalk' AND table_name = 'sessions'
       ORDER BY ordinal_position`,
    );
    expect(columns.rows).toEqual([
      { column_name: 'id', is_nullable: 'NO' },
      { column_name: 'token_hash', is_nullable: 'NO' },
      { column_name: 'user_id', is_nullable: 'NO' },
      { column_name: 'created_at', is_nullable: 'NO' },
      { column_name: 'expires_at', is_nullable: 'NO' },
      { column_name: 'revoked_at', is_nullable: 'YES' },
      { column_name: 'last_seen_at', is_nullable: 'NO' },
    ]);
    const indexes = await pool.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE schemaname = 'floorwalk' AND tablename = 'sessions'",
    );
    expect(
      indexes.rows.some(({ indexdef }) =>
        /UNIQUE INDEX.*\(id\)/.test(indexdef),
      ),
    ).toBe(true);
    expect(
      indexes.rows.some(({ indexdef }) =>
        /UNIQUE INDEX.*\(token_hash\)/.test(indexdef),
      ),
    ).toBe(true);
    expect(
      indexes.rows.some(({ indexdef }) => /\(user_id\)/.test(indexdef)),
    ).toBe(true);
  });

  it('revokes logout sessions, clears the cookie, and rejects a saved-cookie replay', async () => {
    const cookie = cookieFrom(await login().expect(201));
    const response = await request(app.getHttpServer())
      .delete('/api/auth/session')
      .set('Cookie', cookie)
      .expect(204);
    expect(response.text).toBe('');
    const header = (response.headers['set-cookie'] as unknown as string[])[0];
    expect(/^fw_session=;/.test(header)).toBe(true);
    expect(/; Max-Age=0(?:;|$)/i.test(header)).toBe(true);
    expect(/; Path=\/api(?:;|$)/i.test(header)).toBe(true);
    expect(/; HttpOnly(?:;|$)/i.test(header)).toBe(true);
    expect(/; SameSite=Strict(?:;|$)/i.test(header)).toBe(true);
    const session = await pool.query(
      'SELECT revoked_at FROM floorwalk.sessions WHERE token_hash = $1',
      [hash(cookie.slice('fw_session='.length))],
    );
    expect(session.rows[0].revoked_at).toBeInstanceOf(Date);
    await unauthenticated(cookie);
  });

  it('allows logout without an authenticated session', async () => {
    await request(app.getHttpServer()).delete('/api/auth/session').expect(204);
  });

  it('clears all sessions when resetting seed data', async () => {
    await login().expect(201);
    const before = await pool.query(
      'SELECT COUNT(*)::int AS count FROM floorwalk.sessions',
    );
    expect(before.rows[0].count).toBeGreaterThan(0);
    await seedDatabase();
    const after = await pool.query(
      'SELECT COUNT(*)::int AS count FROM floorwalk.sessions',
    );
    expect(after.rows[0].count).toBe(0);
  });
});
