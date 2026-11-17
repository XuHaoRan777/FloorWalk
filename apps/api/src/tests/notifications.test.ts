import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { User } from '@libs/shared';
import { AppModule } from '../app.module.js';
import { hashSessionId } from '../auth/auth.js';
import { HttpErrorFilter } from '../filters/http-exception.filter.js';
import { createPool } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { seedDatabase } from '../db/seed.js';
import { notifyTask } from '../services/notifications.js';

describe('FW-036 notification inbox API', () => {
  let app!: NestExpressApplication;
  let pool!: Pool;
  let managerCookie: string;
  let otherManagerCookie: string;
  let managerId: string;
  let orgId: string;
  let otherManagerId: string;
  let otherOrgId: string;
  let otherOrgAdminId: string;
  const notificationIds: string[] = [];
  const sessionHashes: string[] = [];

  const login = async (loginName: string) => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/session')
      .send({ loginName, password: 'northbean-demo' })
      .expect(201);
    const cookie = (
      response.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];
    sessionHashes.push(hashSessionId(cookie.slice('fw_session='.length)));
    return {
      cookie,
      user: response.body.user as User,
    };
  };

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

    const manager = await login('manager2@northbean.example');
    const otherManager = await login('inspector+nb-002@northbean.example');
    managerCookie = manager.cookie;
    managerId = manager.user.id;
    orgId = manager.user.org.id;
    otherManagerCookie = otherManager.cookie;
    otherManagerId = otherManager.user.id;
    otherOrgId = (
      await pool.query<{ orgId: string }>(
        'SELECT id AS "orgId" FROM floorwalk.organizations WHERE id <> $1 LIMIT 1',
        [orgId],
      )
    ).rows[0].orgId;
    otherOrgAdminId = (
      await pool.query<{ id: string }>(
        `SELECT id FROM floorwalk.users WHERE org_id = $1 AND role = 'admin' LIMIT 1`,
        [otherOrgId],
      )
    ).rows[0].id;

    for (let index = 0; index < 52; index += 1) {
      const id = randomUUID();
      notificationIds.push(id);
      await pool.query(
        `INSERT INTO floorwalk.notifications
           (id, org_id, user_id, type, payload_json, created_at, read_at)
         VALUES ($1, $2, $3, 'task_overdue', $4::jsonb,
           now() - ($5::int * interval '1 second'),
           CASE WHEN $5::int % 2 = 0 THEN NULL ELSE now() END)`,
        [id, orgId, managerId, JSON.stringify({ taskId: randomUUID() }), index],
      );
    }

    const sameOrgId = randomUUID();
    const otherOrgNotificationId = randomUUID();
    notificationIds.push(sameOrgId, otherOrgNotificationId);
    await pool.query(
      `INSERT INTO floorwalk.notifications
         (id, org_id, user_id, type, payload_json)
       VALUES ($1, $2, $3, 'task_overdue', $4::jsonb),
              ($5, $6, $7, 'task_overdue', $8::jsonb)`,
      [
        sameOrgId,
        orgId,
        otherManagerId,
        JSON.stringify({ taskId: randomUUID() }),
        otherOrgNotificationId,
        otherOrgId,
        otherOrgAdminId,
        JSON.stringify({ taskId: randomUUID() }),
      ],
    );
  });

  afterAll(async () => {
    if (notificationIds.length && typeof pool !== 'undefined')
      await pool.query(
        'DELETE FROM floorwalk.notifications WHERE id = ANY($1::uuid[])',
        [notificationIds],
      );
    if (sessionHashes.length && typeof pool !== 'undefined')
      await pool.query(
        'UPDATE floorwalk.sessions SET revoked_at = now() WHERE token_hash = ANY($1::text[])',
        [sessionHashes],
      );
    if (typeof app !== 'undefined') await app.close();
    if (typeof pool !== 'undefined') await pool.end();
  });

  it('requires an authenticated user and returns at most 50 notifications with a stable cursor', async () => {
    await request(app.getHttpServer()).get('/api/me/notifications').expect(401);

    const first = await request(app.getHttpServer())
      .get('/api/me/notifications')
      .set('Cookie', managerCookie)
      .expect(200);
    expect(first.body.notifications).toHaveLength(50);
    expect(first.body.nextCursor).toBe(first.body.notifications[49].id);

    const second = await request(app.getHttpServer())
      .get(`/api/me/notifications?after=${first.body.nextCursor}`)
      .set('Cookie', managerCookie)
      .expect(200);
    expect(second.body.notifications).toHaveLength(2);
    expect(second.body.nextCursor).toBeNull();
    expect(
      second.body.notifications.some((item: { id: string }) =>
        first.body.notifications.some(
          (previous: { id: string }) => previous.id === item.id,
        ),
      ),
    ).toBe(false);
  });

  it('filters unread items and marks one or all as read idempotently', async () => {
    const unread = await request(app.getHttpServer())
      .get('/api/me/notifications?unread_only=true')
      .set('Cookie', managerCookie)
      .expect(200);
    expect(unread.body.notifications).toHaveLength(26);
    expect(
      unread.body.notifications.every(
        (item: { readAt: unknown }) => !item.readAt,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .get('/api/me/notifications/unread-count')
      .set('Cookie', managerCookie)
      .expect(200)
      .expect({ count: 26 });

    await request(app.getHttpServer())
      .post(`/api/me/notifications/${unread.body.notifications[0].id}/read`)
      .set('Cookie', managerCookie)
      .expect(204);
    await request(app.getHttpServer())
      .post(`/api/me/notifications/${unread.body.notifications[0].id}/read`)
      .set('Cookie', managerCookie)
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/me/notifications/unread-count')
      .set('Cookie', managerCookie)
      .expect(200)
      .expect({ count: 25 });

    await request(app.getHttpServer())
      .post('/api/me/notifications/read-all')
      .set('Cookie', managerCookie)
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/me/notifications/unread-count')
      .set('Cookie', managerCookie)
      .expect(200)
      .expect({ count: 0 });
  });

  it('hides another user and another merchant notifications and cursors', async () => {
    const own = await request(app.getHttpServer())
      .get('/api/me/notifications')
      .set('Cookie', managerCookie)
      .expect(200);
    const otherUserNotification = (
      await pool.query<{ id: string }>(
        'SELECT id FROM floorwalk.notifications WHERE user_id = $1',
        [otherManagerId],
      )
    ).rows[0].id;
    const otherOrgNotification = (
      await pool.query<{ id: string }>(
        'SELECT id FROM floorwalk.notifications WHERE org_id = $1',
        [otherOrgId],
      )
    ).rows[0].id;

    for (const id of [otherUserNotification, otherOrgNotification]) {
      await request(app.getHttpServer())
        .post(`/api/me/notifications/${id}/read`)
        .set('Cookie', managerCookie)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/me/notifications?after=${id}`)
        .set('Cookie', managerCookie)
        .expect(404);
    }
    expect(own.body.notifications).toHaveLength(50);
    await request(app.getHttpServer())
      .get('/api/me/notifications')
      .set('Cookie', otherManagerCookie)
      .expect(200)
      .expect((response) => {
        expect(response.body.notifications).toHaveLength(1);
        expect(response.body.notifications[0].id).toBe(otherUserNotification);
      });
  });

  it('accepts events without matching recipients', async () => {
    const client = await pool.connect();
    const taskId = randomUUID();
    try {
      await client.query('BEGIN');
      await expect(
        notifyTask(client, taskId, 'store_manager', {
          type: 'task_overdue',
          payload: { taskId },
        }),
      ).resolves.toBeUndefined();
      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
