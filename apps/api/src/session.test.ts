import { createHash, randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import { errorResponseSchema, loginResponseSchema } from '@libs/shared';
import { AppModule } from './app.module.js';
import { HttpErrorFilter } from './http-exception.filter.js';
import { createPool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';

describe('HttpOnly sessions', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  const initialNodeEnv = process.env.NODE_ENV;
  const temporaryUsers: string[] = [];
  const hash = (value: string) =>
    createHash('sha256').update(value).digest('hex');
  const login = () =>
    request(app.getHttpServer()).post('/api/auth/session').send({
      email: 'supervisor@northbean.example',
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
  const withDraft = async (
    verify: (draft: {
      cookie: string;
      inspectionId: string;
      itemId: string;
    }) => Promise<void>,
  ) => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({
        email: 'inspector@northbean.example',
        password: 'northbean-demo',
      })
      .expect(201);
    const cookie = cookieFrom(response);
    const template = await pool.query<{ id: string }>(
      'SELECT id FROM floorwalk.templates LIMIT 1',
    );
    const created = await request(app.getHttpServer())
      .post('/api/inspections')
      .set('Cookie', cookie)
      .send({ templateId: template.rows[0].id })
      .expect(201);
    const inspectionId = created.body.id as string;
    try {
      const item = await pool.query<{ id: string }>(
        'SELECT id FROM floorwalk.inspection_items WHERE inspection_id = $1 ORDER BY position LIMIT 1',
        [inspectionId],
      );
      await verify({ cookie, inspectionId, itemId: item.rows[0].id });
    } finally {
      const evidence = await pool.query<{ storage_key: string }>(
        `DELETE FROM floorwalk.evidence WHERE inspection_item_id IN
         (SELECT id FROM floorwalk.inspection_items WHERE inspection_id = $1) RETURNING storage_key`,
        [inspectionId],
      );
      for (const row of evidence.rows)
        await rm(
          path.resolve(
            process.env.STORAGE_DIR ?? path.join('apps', 'api', '.storage'),
            row.storage_key,
          ),
          { force: true },
        );
      await pool.query(
        'DELETE FROM floorwalk.inspection_items WHERE inspection_id = $1',
        [inspectionId],
      );
      await pool.query('DELETE FROM floorwalk.inspections WHERE id = $1', [
        inspectionId,
      ]);
    }
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

  it('stores only the SHA-256 of a random 32-byte ID with a fixed one-hour expiry', async () => {
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
      revoked_at: Date | null;
    }>('SELECT * FROM floorwalk.sessions WHERE token_hash = $1', [hash(rawId)]);
    expect(result.rows).toHaveLength(1);
    const session = result.rows[0];
    expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.token_hash).toBe(hash(rawId));
    expect(session.user_id).toBe(body.user.id);
    expect(session.revoked_at).toBeNull();
    expect(
      Math.abs(
        session.expires_at.getTime() - session.created_at.getTime() - 3600000,
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
        expect(/; Max-Age=3600(?:;|$)/i.test(header)).toBe(true);
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
        email: 'supervisor@northbean.example',
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

  it('rejects a request with no cookie', async () => {
    await unauthenticated();
  });

  it('rejects an unknown session ID', async () => {
    await unauthenticated(
      `fw_session=${randomBytes(32).toString('base64url')}`,
    );
  });

  it('rejects an expired session', async () => {
    const cookie = cookieFrom(await login().expect(201));
    await pool.query(
      "UPDATE floorwalk.sessions SET expires_at = NOW() - INTERVAL '1 second' WHERE token_hash = $1",
      [hash(cookie.slice('fw_session='.length))],
    );
    await unauthenticated(cookie);
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
      `INSERT INTO floorwalk.users (email, password_hash, display_name, role)
       SELECT 'session-deleted@northbean.example', password_hash, 'Session test', 'supervisor'
       FROM floorwalk.users WHERE email = 'supervisor@northbean.example' RETURNING id`,
    );
    const userId = created.rows[0].id;
    temporaryUsers.push(userId);
    const cookies: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/auth/session')
        .send({
          email: 'session-deleted@northbean.example',
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
        email: 'supervisor@northbean.example',
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

  it.each([
    ['arbitrary', 'http://outside.example'],
    ['absent', undefined],
  ])('allows session writes with an %s Origin', async (_label, origin) => {
    const call = login();
    if (origin) call.set('Origin', origin);
    const loginResponse = await call.expect(201);
    if (origin) {
      expect(loginResponse.headers['access-control-allow-origin']).toBe(origin);
      expect(loginResponse.headers['access-control-allow-credentials']).toBe(
        'true',
      );
    }
    const cookie = cookieFrom(loginResponse);
    const me = request(app.getHttpServer()).get('/api/me').set('Cookie', cookie);
    if (origin) me.set('Origin', origin);
    await me.expect(200);
    const logout = request(app.getHttpServer())
      .delete('/api/auth/session')
      .set('Cookie', cookie);
    if (origin) logout.set('Origin', origin);
    await logout.expect(204);
    await unauthenticated(cookie);
  });

  it('accepts a foreign-Origin PATCH and modifies the inspection item', async () => {
    await withDraft(async ({ cookie, inspectionId, itemId }) => {
      const response = await request(app.getHttpServer())
        .patch(`/api/inspections/${inspectionId}/items/${itemId}`)
        .set('Cookie', cookie)
        .set('Origin', 'http://outside.example')
        .send({ result: 'pass' })
        .expect(200);
      const item = await pool.query(
        'SELECT result FROM floorwalk.inspection_items WHERE id = $1',
        [itemId],
      );
      expect(item.rows[0].result).toBe('pass');
    });
  });

  it('accepts a foreign-Origin multipart upload', async () => {
    await withDraft(async ({ cookie, inspectionId, itemId }) => {
      await request(app.getHttpServer())
        .post(`/api/inspections/${inspectionId}/items/${itemId}/evidence`)
        .set('Cookie', cookie)
        .set('Origin', 'http://outside.example')
        .attach('file', Buffer.from('origin-test'), {
          filename: 'origin.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);
      const evidence = await pool.query(
        'SELECT id FROM floorwalk.evidence WHERE inspection_item_id = $1',
        [itemId],
      );
      expect(evidence.rows).toHaveLength(1);
    });
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
