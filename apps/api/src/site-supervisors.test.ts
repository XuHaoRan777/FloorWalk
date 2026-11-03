import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import {
  adminSitesResponseSchema,
  adminUsersResponseSchema,
  errorResponseSchema,
  setSiteSupervisorResponseSchema,
} from '@libs/shared';
import { AppModule } from './app.module.js';
import { hashSessionId } from './auth.js';
import { HttpErrorFilter } from './http-exception.filter.js';
import { createPool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';

describe('site supervisor assignment (FW-019 AC-03/04)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let siteId: string;
  let otherSiteId: string;
  let originalSupervisorId: string;
  let adminCookie: string;
  let supervisorCookie: string;
  let inspectorCookie: string;
  let users: Map<string, string>;
  const unassignedSupervisorId = randomUUID();
  const sessionHashes: string[] = [];
  const assign = (userId: string | null, cookie = adminCookie, id = siteId) =>
    request(app.getHttpServer())
      .put(`/api/admin/sites/${id}/supervisor`)
      .set('Cookie', cookie)
      .send({ userId });

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    pool = createPool();
    const userRows = await pool.query<{ id: string; email: string }>(
      'SELECT id, email FROM floorwalk.users',
    );
    users = new Map(userRows.rows.map((user) => [user.email, user.id]));
    const sites = await pool.query<{ id: string; code: string }>(
      'SELECT id, code FROM floorwalk.sites',
    );
    siteId = sites.rows.find((site) => site.code === 'NB-001')!.id;
    otherSiteId = sites.rows.find((site) => site.code === 'DEMO2-001')!.id;
    const assignment = await pool.query<{ user_id: string }>(
      'SELECT user_id FROM floorwalk.site_supervisors WHERE site_id = $1',
      [siteId],
    );
    originalSupervisorId = assignment.rows[0].user_id;
    await pool.query(
      `INSERT INTO floorwalk.users
         (id, org_id, email, password_hash, display_name, role)
       SELECT $1, org_id, $2, password_hash, '未指派主管', 'supervisor'
       FROM floorwalk.users WHERE email = 'hq@northbean.example'`,
      [unassignedSupervisorId, `fw019-${unassignedSupervisorId}@example.test`],
    );
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
      const cookie = (
        response.headers['set-cookie'] as unknown as string[]
      )[0].split(';')[0];
      sessionHashes.push(hashSessionId(cookie.slice('fw_session='.length)));
      return cookie;
    };
    adminCookie = await login('hq@northbean.example');
    supervisorCookie = await login('supervisor@northbean.example');
    inspectorCookie = await login('inspector@northbean.example');
  }, 60000);

  afterEach(async () => {
    await pool.query(
      `INSERT INTO floorwalk.site_supervisors (site_id, user_id)
       VALUES ($1, $2) ON CONFLICT (site_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
      [siteId, originalSupervisorId],
    );
  });

  afterAll(async () => {
    try {
      await pool.query(
        'DELETE FROM floorwalk.sessions WHERE token_hash = ANY($1::text[])',
        [sessionHashes],
      );
      await pool.query('DELETE FROM floorwalk.users WHERE id = $1', [
        unassignedSupervisorId,
      ]);
    } finally {
      await pool.end();
      await app.close();
    }
  });

  it('assigns an unassigned local supervisor, replaces it, and cancels with null', async () => {
    const assigned = await assign(unassignedSupervisorId).expect(200);
    const site = setSiteSupervisorResponseSchema.parse(assigned.body);
    expect(site.id).toBe(siteId);
    expect(site.supervisor).toEqual({
      id: unassignedSupervisorId,
      displayName: '未指派主管',
    });
    const listed = await request(app.getHttpServer())
      .get('/api/admin/sites')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(
      adminSitesResponseSchema
        .parse(listed.body)
        .find((entry) => entry.id === siteId)?.supervisor,
    ).toEqual(site.supervisor);
    const replacementId = users.get('supervisor+2@northbean.example')!;
    const replaced = await assign(replacementId).expect(200);
    expect(
      setSiteSupervisorResponseSchema.parse(replaced.body).supervisor?.id,
    ).toBe(replacementId);
    const rows = await pool.query<{ user_id: string }>(
      'SELECT user_id FROM floorwalk.site_supervisors WHERE site_id = $1',
      [siteId],
    );
    expect(rows.rows).toEqual([{ user_id: replacementId }]);
    const cancelled = await assign(null).expect(200);
    expect(
      setSiteSupervisorResponseSchema.parse(cancelled.body).supervisor,
    ).toBeNull();
    const none = await pool.query(
      'SELECT user_id FROM floorwalk.site_supervisors WHERE site_id = $1',
      [siteId],
    );
    expect(none.rowCount).toBe(0);
  });

  it.each([
    'supervisor@demo2.example',
    'hq@northbean.example',
    'inspector@northbean.example',
  ])('rejects an invalid supervisor %s with 400', async (email) => {
    const response = await assign(users.get(email)!).expect(400);
    expect(errorResponseSchema.parse(response.body).code).toBe(
      'VALIDATION_FAILED',
    );
    const original = await pool.query<{ user_id: string }>(
      'SELECT user_id FROM floorwalk.site_supervisors WHERE site_id = $1',
      [siteId],
    );
    expect(original.rows).toEqual([{ user_id: originalSupervisorId }]);
  });

  it('rejects supervisor assignment calls and hides another organization site', async () => {
    const forbidden = await assign(null, supervisorCookie).expect(403);
    expect(errorResponseSchema.parse(forbidden.body).code).toBe('FORBIDDEN');
    const hidden = await assign(null, adminCookie, otherSiteId).expect(404);
    expect(errorResponseSchema.parse(hidden.body).code).toBe('NOT_FOUND');
  });

  it('lists only local accounts for admin, including unassigned supervisors and complete site fields', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Cookie', adminCookie)
      .expect(200);
    const accounts = adminUsersResponseSchema.parse(response.body);
    const expected = await pool.query<{ id: string }>(
      `SELECT id FROM floorwalk.users WHERE org_id =
       (SELECT org_id FROM floorwalk.users WHERE email = 'hq@northbean.example')`,
    );
    expect(accounts.map((user) => user.id).sort()).toEqual(
      expected.rows.map((user) => user.id).sort(),
    );
    expect(
      accounts.find((user) => user.id === unassignedSupervisorId),
    ).toMatchObject({
      role: 'supervisor',
      siteId: null,
      site: null,
      disabled: false,
      mustChangePassword: false,
    });
    const inspector = accounts.find(
      (user) => user.email === 'inspector@northbean.example',
    );
    expect(inspector?.site).toMatchObject({
      id: siteId,
      code: 'NB-001',
      active: true,
    });
    for (const user of response.body) {
      expect(Object.hasOwn(user, 'password_hash')).toBe(false);
      expect(Object.hasOwn(user, 'passwordHash')).toBe(false);
    }
  });

  it('lists only inspectors in the supervisor assigned sites and rejects inspector callers', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Cookie', supervisorCookie)
      .expect(200);
    const accounts = adminUsersResponseSchema.parse(response.body);
    const expected = await pool.query<{ id: string }>(
      `SELECT u.id FROM floorwalk.users u
       JOIN floorwalk.sites s ON s.id = u.site_id AND s.org_id = u.org_id
       JOIN floorwalk.site_supervisors ss ON ss.site_id = s.id
       WHERE ss.user_id = $1 AND u.role = 'inspector' AND u.org_id =
       (SELECT org_id FROM floorwalk.users WHERE id = $1)`,
      [originalSupervisorId],
    );
    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts.map((user) => user.id).sort()).toEqual(
      expected.rows.map((user) => user.id).sort(),
    );
    expect(
      accounts.every((user) => user.role === 'inspector' && user.site),
    ).toBe(true);
    const forbidden = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Cookie', inspectorCookie)
      .expect(403);
    expect(errorResponseSchema.parse(forbidden.body).code).toBe('FORBIDDEN');
  });
});
