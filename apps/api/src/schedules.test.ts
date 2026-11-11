import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import {
  adminSchedulesResponseSchema,
  adminSiteSchedulesResponseSchema,
  scheduleResponseSchema,
  type AdminSchedule,
  type ScheduleDefinition,
} from '@libs/shared';
import { AppModule } from './app.module.js';
import { hashSessionId } from './auth.js';
import { createPool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { HttpErrorFilter } from './http-exception.filter.js';
import {
  TASK_SCHEDULER_CLOCK,
  TaskSchedulerService,
} from './task-scheduler.js';

type Fixture = {
  orgId: string;
  adminCookie: string;
  managerCookie: string;
  templateId: string;
  siteIds: string[];
};

describe('FW-027 schedule administration', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let own: Fixture;
  let other: Fixture;
  const orgIds: string[] = [];

  function definition(
    name: string,
    templateId = own.templateId,
  ): ScheduleDefinition {
    return {
      name,
      days: Array.from({ length: 7 }, (_, index) => ({
        weekday: index + 1,
        enabled: true,
        tasks:
          index === 0
            ? [
                { templateId, startsAt: '23:30', endsAt: '01:15' },
                { templateId, startsAt: '23:59', endsAt: '00:00' },
                { templateId, startsAt: '08:00', endsAt: '08:00' },
              ]
            : [],
      })),
    };
  }

  async function fixture(): Promise<Fixture> {
    const client = await pool.connect();
    const orgId = randomUUID();
    const adminId = randomUUID();
    const managerId = randomUUID();
    const siteIds = [randomUUID(), randomUUID()];
    const templateId = randomUUID();
    const adminToken = randomUUID();
    const managerToken = randomUUID();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO floorwalk.organizations (id, name) VALUES ($1, $2)',
        [orgId, `FW027-${orgId}`],
      );
      await client.query(
        `INSERT INTO floorwalk.sites (id, org_id, code, name)
         VALUES ($1, $3, 'A', 'FW-027 A'), ($2, $3, 'B', 'FW-027 B')`,
        [...siteIds, orgId],
      );
      await client.query(
        `INSERT INTO floorwalk.users (id, org_id, login_name, password_hash, display_name, role, site_id)
         VALUES ($1, $2, 'admin@example.test', 'hash', 'Test admin', 'admin', NULL),
                ($3, $2, 'manager@example.test', 'hash', 'Test manager', 'store_manager', $4)`,
        [adminId, orgId, managerId, siteIds[0]],
      );
      await client.query(
        `INSERT INTO floorwalk.sessions (token_hash, user_id, expires_at)
         VALUES ($1, $2, now() + interval '7 days'), ($3, $4, now() + interval '7 days')`,
        [
          hashSessionId(adminToken),
          adminId,
          hashSessionId(managerToken),
          managerId,
        ],
      );
      await client.query(
        `INSERT INTO floorwalk.templates (id, org_id, name, ai_enabled)
         VALUES ($1, $2, '巡检模板', false)`,
        [templateId, orgId],
      );
      await client.query('COMMIT');
      orgIds.push(orgId);
      return {
        orgId,
        templateId,
        siteIds,
        adminCookie: `fw_session=${adminToken}`,
        managerCookie: `fw_session=${managerToken}`,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    await runMigrations();
    pool = createPool();
    own = await fixture();
    other = await fixture();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TASK_SCHEDULER_CLOCK)
      .useValue({ now: () => new Date('2026-11-09T12:00:00.000Z') })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    if (pool && orgIds.length) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const table of [
          'site_schedules',
          'site_schedule_skips',
          'inspection_tasks',
          'schedules',
          'templates',
          'users',
          'sites',
        ])
          await client.query(
            `DELETE FROM floorwalk.${table} WHERE org_id = ANY($1::uuid[])`,
            [orgIds],
          );
        await client.query(
          'DELETE FROM floorwalk.organizations WHERE id = ANY($1::uuid[])',
          [orgIds],
        );
        const remaining = await client.query(
          'SELECT count(*) FROM floorwalk.organizations WHERE id = ANY($1::uuid[])',
          [orgIds],
        );
        expect(remaining.rows[0].count).toBe('0');
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    if (pool) await pool.end();
  });

  it('creates and lists seven-day schedules with minute windows, overlaps and repeated templates', async () => {
    const input = definition('夜间巡检');
    const created = await request(app.getHttpServer())
      .post('/api/admin/schedules')
      .set('Cookie', own.adminCookie)
      .send(input)
      .expect(201);
    const value = scheduleResponseSchema.parse(created.body);
    expect(value).toMatchObject(input);
    expect(value.days.every((day) => day.enabled)).toBe(true);
    const listed = await request(app.getHttpServer())
      .get('/api/admin/schedules')
      .set('Cookie', own.adminCookie)
      .expect(200);
    expect(adminSchedulesResponseSchema.parse(listed.body)).toContainEqual(
      value,
    );
    await request(app.getHttpServer())
      .post('/api/admin/schedules')
      .set('Cookie', own.adminCookie)
      .send(input)
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/admin/schedules')
      .set('Cookie', other.adminCookie)
      .send(definition(input.name, other.templateId))
      .expect(201);
    const changed = definition('日程已修改');
    changed.days[0].enabled = false;
    changed.days[1].tasks = [changed.days[0].tasks[0]];
    const updated = await request(app.getHttpServer())
      .put(`/api/admin/schedules/${value.id}`)
      .set('Cookie', own.adminCookie)
      .send(changed)
      .expect(200);
    expect(scheduleResponseSchema.parse(updated.body)).toMatchObject({
      ...changed,
      id: value.id,
    });
  });

  it('rejects malformed weeks, blank names and times outside minute precision on create and update', async () => {
    const input = definition('校验方案');
    const created = await request(app.getHttpServer())
      .post('/api/admin/schedules')
      .set('Cookie', own.adminCookie)
      .send(input)
      .expect(201);
    const invalid = [
      { ...input, name: '  ' },
      { ...input, days: input.days.slice(0, 6) },
      { ...input, days: [...input.days.slice(0, 6), input.days[0]] },
      ...['24:00', '08:60', '8:00', '08:00:30'].map((startsAt) => ({
        ...input,
        days: input.days.map((day) => ({
          ...day,
          tasks: [{ templateId: own.templateId, startsAt, endsAt: '12:00' }],
        })),
      })),
    ];
    for (const body of invalid) {
      await request(app.getHttpServer())
        .post('/api/admin/schedules')
        .set('Cookie', own.adminCookie)
        .send(body)
        .expect(400);
      await request(app.getHttpServer())
        .put(`/api/admin/schedules/${created.body.id}`)
        .set('Cookie', own.adminCookie)
        .send(body)
        .expect(400);
    }
    await request(app.getHttpServer())
      .put(`/api/admin/schedules/${created.body.id}`)
      .set('Cookie', own.adminCookie)
      .send(definition('日程已修改'))
      .expect(409);
    await request(app.getHttpServer())
      .delete(`/api/admin/schedules/${created.body.id}`)
      .set('Cookie', own.adminCookie)
      .expect(204);
    const listed = await request(app.getHttpServer())
      .get('/api/admin/schedules')
      .set('Cookie', own.adminCookie)
      .expect(200);
    expect(
      listed.body.some((entry: { id: string }) => entry.id === created.body.id),
    ).toBe(false);
  });

  it('assigns one schedule to multiple sites, replaces it and clears individual or batch selections', async () => {
    const target = await fixture();
    const server = app.getHttpServer();
    const initial = await request(server)
      .get('/api/admin/site-schedules')
      .set('Cookie', target.adminCookie)
      .expect(200);
    expect(adminSiteSchedulesResponseSchema.parse(initial.body)).toHaveLength(
      2,
    );
    expect(
      initial.body.every(
        (entry: { scheduleId: string | null }) => entry.scheduleId === null,
      ),
    ).toBe(true);
    const schedules: AdminSchedule[] = [];
    for (const name of ['方案 A', '方案 B']) {
      const created = await request(server)
        .post('/api/admin/schedules')
        .set('Cookie', target.adminCookie)
        .send(definition(name, target.templateId))
        .expect(201);
      schedules.push(scheduleResponseSchema.parse(created.body));
    }
    const assigned = await request(server)
      .put('/api/admin/site-schedules')
      .set('Cookie', target.adminCookie)
      .send({
        siteIds: [...target.siteIds, target.siteIds[0]],
        scheduleId: schedules[0].id,
      })
      .expect(200);
    expect(
      adminSiteSchedulesResponseSchema
        .parse(assigned.body)
        .every((entry) => entry.scheduleId === schedules[0].id),
    ).toBe(true);
    const replaced = await request(server)
      .put('/api/admin/site-schedules')
      .set('Cookie', target.adminCookie)
      .send({ siteIds: [target.siteIds[0]], scheduleId: schedules[1].id })
      .expect(200);
    expect(
      replaced.body.map((entry: { scheduleId: string }) => entry.scheduleId),
    ).toEqual([schedules[1].id, schedules[0].id]);
    await request(server)
      .put('/api/admin/site-schedules')
      .set('Cookie', target.adminCookie)
      .send({ siteIds: [target.siteIds[0]], scheduleId: null })
      .expect(200);
    const cleared = await request(server)
      .put('/api/admin/site-schedules')
      .set('Cookie', target.adminCookie)
      .send({ siteIds: target.siteIds, scheduleId: null })
      .expect(200);
    expect(
      cleared.body.every(
        (entry: { scheduleId: string | null }) => entry.scheduleId === null,
      ),
    ).toBe(true);
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM floorwalk.site_schedules WHERE org_id = $1',
          [target.orgId],
        )
      ).rows[0].count,
    ).toBe('0');
  });

  it('adds inclusive date ranges to multiple sites, permits overlaps and single days and deletes one range', async () => {
    const target = await fixture();
    const server = app.getHttpServer();
    const dates = {
      startsOn: '2026-11-09',
      endsOn: '2026-11-11',
      note: '门店装修',
    };
    const added = await request(server)
      .post('/api/admin/site-schedules/skips')
      .set('Cookie', target.adminCookie)
      .send({ siteIds: target.siteIds, ...dates })
      .expect(201);
    const values = adminSiteSchedulesResponseSchema.parse(added.body);
    expect(values.every((entry) => entry.skippedRanges.length === 1)).toBe(
      true,
    );
    for (const value of values)
      expect(value.skippedRanges[0]).toMatchObject(dates);
    await request(server)
      .post('/api/admin/site-schedules/skips')
      .set('Cookie', target.adminCookie)
      .send({
        siteIds: [target.siteIds[0]],
        startsOn: '2026-11-11',
        endsOn: '2026-11-11',
      })
      .expect(201);
    const overlapping = await request(server)
      .post('/api/admin/site-schedules/skips')
      .set('Cookie', target.adminCookie)
      .send({
        siteIds: [target.siteIds[0]],
        startsOn: '2026-11-10',
        endsOn: '2026-11-12',
        note: null,
      })
      .expect(201);
    expect(overlapping.body[0].skippedRanges).toHaveLength(3);
    expect(overlapping.body[0].skippedRanges[1].note).toBeNull();
    for (const invalid of [
      { startsOn: '2026-11-12', endsOn: '2026-11-11' },
      { startsOn: '2026-02-30', endsOn: '2026-03-01' },
      { startsOn: '2026-11-11', endsOn: '2026-13-01' },
    ])
      await request(server)
        .post('/api/admin/site-schedules/skips')
        .set('Cookie', target.adminCookie)
        .send({ siteIds: target.siteIds, ...invalid })
        .expect(400);
    await request(server)
      .delete(
        `/api/admin/site-schedules/skips/${values[0].skippedRanges[0].id}`,
      )
      .set('Cookie', target.adminCookie)
      .expect(204);
    const listed = await request(server)
      .get('/api/admin/site-schedules')
      .set('Cookie', target.adminCookie)
      .expect(200);
    const persisted = adminSiteSchedulesResponseSchema.parse(listed.body);
    expect(persisted[0].skippedRanges).toHaveLength(2);
    expect(persisted[1].skippedRanges).toHaveLength(1);
  });

  it('allows editing an assigned schedule, rejects deleting it and protects referenced templates in the database', async () => {
    const target = await fixture();
    const server = app.getHttpServer();
    const input = definition('选用中的方案', target.templateId);
    const created = await request(server)
      .post('/api/admin/schedules')
      .set('Cookie', target.adminCookie)
      .send(input)
      .expect(201);
    await request(server)
      .put('/api/admin/site-schedules')
      .set('Cookie', target.adminCookie)
      .send({ siteIds: target.siteIds, scheduleId: created.body.id })
      .expect(200);
    const updated = await request(server)
      .put(`/api/admin/schedules/${created.body.id}`)
      .set('Cookie', target.adminCookie)
      .send({ ...input, name: '选用后仍可修改' })
      .expect(200);
    expect(updated.body.name).toBe('选用后仍可修改');
    await request(server)
      .delete(`/api/admin/schedules/${created.body.id}`)
      .set('Cookie', target.adminCookie)
      .expect(409);
    await expect(
      pool.query('DELETE FROM floorwalk.templates WHERE id = $1', [
        target.templateId,
      ]),
    ).rejects.toMatchObject({
      code: '23001',
      constraint: 'schedule_tasks_template_fk',
    });
    await expect(
      pool.query(
        "UPDATE floorwalk.templates SET org_id = $1, name = '转移模板' WHERE id = $2",
        [other.orgId, target.templateId],
      ),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'schedule_tasks_template_fk',
    });
    await request(server)
      .put('/api/admin/site-schedules')
      .set('Cookie', target.adminCookie)
      .send({ siteIds: target.siteIds, scheduleId: null })
      .expect(200);
    await request(server)
      .delete(`/api/admin/schedules/${created.body.id}`)
      .set('Cookie', target.adminCookie)
      .expect(204);
  });

  it('returns 403 to non-admins on all eight schedule management endpoints', async () => {
    const server = app.getHttpServer();
    for (const call of [
      () => request(server).get('/api/admin/schedules'),
      () =>
        request(server)
          .post('/api/admin/schedules')
          .send(definition('禁止创建')),
      () =>
        request(server)
          .put(`/api/admin/schedules/${randomUUID()}`)
          .send(definition('禁止修改')),
      () => request(server).delete(`/api/admin/schedules/${randomUUID()}`),
      () => request(server).get('/api/admin/site-schedules'),
      () =>
        request(server)
          .put('/api/admin/site-schedules')
          .send({ siteIds: own.siteIds, scheduleId: null }),
      () =>
        request(server).post('/api/admin/site-schedules/skips').send({
          siteIds: own.siteIds,
          startsOn: '2026-11-11',
          endsOn: '2026-11-11',
        }),
      () =>
        request(server).delete(
          `/api/admin/site-schedules/skips/${randomUUID()}`,
        ),
    ])
      await call().set('Cookie', own.managerCookie).expect(403);
  });

  it('hides foreign resources with 404 and never partially mutates a cross-tenant batch', async () => {
    const target = await fixture();
    const foreign = await fixture();
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/api/admin/schedules')
      .set('Cookie', foreign.adminCookie)
      .send(definition('另一商家的方案', foreign.templateId))
      .expect(201);
    const ownCreated = await request(server)
      .post('/api/admin/schedules')
      .set('Cookie', target.adminCookie)
      .send(definition('自己的方案', target.templateId))
      .expect(201);
    const foreignSkips = await request(server)
      .post('/api/admin/site-schedules/skips')
      .set('Cookie', foreign.adminCookie)
      .send({
        siteIds: foreign.siteIds,
        startsOn: '2026-11-11',
        endsOn: '2026-11-11',
      })
      .expect(201);
    const ownSchedule = ownCreated.body.id as string;
    const foreignSchedule = created.body.id as string;
    const foreignSkip = adminSiteSchedulesResponseSchema.parse(
      foreignSkips.body,
    )[0].skippedRanges[0].id;
    const list = await request(server)
      .get('/api/admin/schedules')
      .set('Cookie', target.adminCookie)
      .expect(200);
    expect(list.body.map((entry: { id: string }) => entry.id)).toEqual([
      ownSchedule,
    ]);
    const siteList = await request(server)
      .get('/api/admin/site-schedules')
      .set('Cookie', target.adminCookie)
      .expect(200);
    expect(
      siteList.body.map((entry: { siteId: string }) => entry.siteId),
    ).toEqual(target.siteIds);
    for (const templateId of [foreign.templateId, randomUUID()]) {
      await request(server)
        .post('/api/admin/schedules')
        .set('Cookie', target.adminCookie)
        .send(definition('越权模板', templateId))
        .expect(404);
      await request(server)
        .put(`/api/admin/schedules/${ownSchedule}`)
        .set('Cookie', target.adminCookie)
        .send(definition('越权模板', templateId))
        .expect(404);
    }
    for (const id of [foreignSchedule, randomUUID()]) {
      await request(server)
        .put(`/api/admin/schedules/${id}`)
        .set('Cookie', target.adminCookie)
        .send(definition('越权方案', target.templateId))
        .expect(404);
      await request(server)
        .delete(`/api/admin/schedules/${id}`)
        .set('Cookie', target.adminCookie)
        .expect(404);
      await request(server)
        .put('/api/admin/site-schedules')
        .set('Cookie', target.adminCookie)
        .send({ siteIds: target.siteIds, scheduleId: id })
        .expect(404);
    }
    for (const siteId of [foreign.siteIds[0], randomUUID()]) {
      await request(server)
        .put('/api/admin/site-schedules')
        .set('Cookie', target.adminCookie)
        .send({ siteIds: [target.siteIds[0], siteId], scheduleId: ownSchedule })
        .expect(404);
      await request(server)
        .put('/api/admin/site-schedules')
        .set('Cookie', target.adminCookie)
        .send({ siteIds: [target.siteIds[0], siteId], scheduleId: null })
        .expect(404);
      await request(server)
        .post('/api/admin/site-schedules/skips')
        .set('Cookie', target.adminCookie)
        .send({
          siteIds: [target.siteIds[0], siteId],
          startsOn: '2026-11-11',
          endsOn: '2026-11-11',
        })
        .expect(404);
    }
    for (const skipId of [foreignSkip, randomUUID()])
      await request(server)
        .delete(`/api/admin/site-schedules/skips/${skipId}`)
        .set('Cookie', target.adminCookie)
        .expect(404);
    const persisted = await request(server)
      .get('/api/admin/site-schedules')
      .set('Cookie', target.adminCookie)
      .expect(200);
    expect(
      adminSiteSchedulesResponseSchema
        .parse(persisted.body)
        .every(
          (entry) => !entry.scheduleId && entry.skippedRanges.length === 0,
        ),
    ).toBe(true);
    expect(
      (
        await pool.query('SELECT name FROM floorwalk.schedules WHERE id = $1', [
          foreignSchedule,
        ])
      ).rows[0].name,
    ).toBe('另一商家的方案');
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM floorwalk.site_schedule_skips WHERE id = $1',
          [foreignSkip],
        )
      ).rows[0].count,
    ).toBe('1');
  });

  it('generates daily tasks idempotently and reconciles only unstarted tasks after plan changes', async () => {
    const target = await fixture();
    const server = app.getHttpServer();
    const date = '2026-11-09';
    const created = await request(server)
      .post('/api/admin/schedules')
      .set('Cookie', target.adminCookie)
      .send(definition('今日任务', target.templateId))
      .expect(201);
    const scheduleId = created.body.id as string;

    await request(server)
      .put('/api/admin/site-schedules')
      .set('Cookie', target.adminCookie)
      .send({ siteIds: [target.siteIds[0]], scheduleId })
      .expect(200);

    const readTasks = async () =>
      (
        await pool.query<{
          id: string;
          templateId: string;
          position: number;
          occurrence: number;
          startsAt: Date;
          dueAt: Date;
          status: string;
        }>(
          `SELECT id, template_id AS "templateId", position, occurrence,
             starts_at AS "startsAt", due_at AS "dueAt", status
           FROM floorwalk.inspection_tasks
           WHERE site_id = $1 AND task_date = $2::date
           ORDER BY position, occurrence`,
          [target.siteIds[0], date],
        )
      ).rows;

    const initial = await readTasks();
    expect(initial).toHaveLength(3);
    const initialIds = initial.map((task) => task.id);
    await app.get(TaskSchedulerService).syncSiteDate(target.siteIds[0], date);
    expect((await readTasks()).map((task) => task.id)).toEqual(initialIds);

    const started = initial[0];
    await pool.query(
      `UPDATE floorwalk.inspection_tasks SET status = 'in_progress' WHERE id = $1`,
      [started.id],
    );
    const changed = definition('今日任务已调整');
    changed.days[0].tasks = [
      { templateId: target.templateId, startsAt: '06:00', endsAt: '07:00' },
      { templateId: target.templateId, startsAt: '10:00', endsAt: '11:00' },
    ];
    await request(server)
      .put(`/api/admin/schedules/${scheduleId}`)
      .set('Cookie', target.adminCookie)
      .send(changed)
      .expect(200);

    let tasks = await readTasks();
    expect(tasks).toHaveLength(3);
    expect(tasks.find((task) => task.id === started.id)).toMatchObject({
      status: 'in_progress',
      startsAt: started.startsAt,
      dueAt: started.dueAt,
    });
    expect(
      tasks
        .filter((task) => task.status === 'not_started')
        .map((task) => [task.startsAt.toISOString(), task.dueAt.toISOString()]),
    ).toEqual([
      ['2026-11-08T22:00:00.000Z', '2026-11-08T23:00:00.000Z'],
      ['2026-11-09T02:00:00.000Z', '2026-11-09T03:00:00.000Z'],
    ]);

    const skipped = await request(server)
      .post('/api/admin/site-schedules/skips')
      .set('Cookie', target.adminCookie)
      .send({
        siteIds: [target.siteIds[0]],
        startsOn: date,
        endsOn: date,
      })
      .expect(201);
    const skipId = adminSiteSchedulesResponseSchema
      .parse(skipped.body)
      .find((site) => site.siteId === target.siteIds[0])!.skippedRanges[0].id;
    tasks = await readTasks();
    expect(tasks.map((task) => task.id)).toEqual([started.id]);

    await request(server)
      .delete(`/api/admin/site-schedules/skips/${skipId}`)
      .set('Cookie', target.adminCookie)
      .expect(204);
    tasks = await readTasks();
    expect(tasks).toHaveLength(3);
    expect(tasks.some((task) => task.id === started.id)).toBe(true);

    await request(server)
      .put('/api/admin/site-schedules')
      .set('Cookie', target.adminCookie)
      .send({ siteIds: [target.siteIds[0]], scheduleId: null })
      .expect(200);
    tasks = await readTasks();
    expect(tasks.map((task) => task.id)).toEqual([started.id]);
  });
});
