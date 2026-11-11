import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import { todayResponseSchema } from '@libs/shared';
import { AppModule } from './app.module.js';
import { hashSessionId } from './auth.js';
import { createPool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { HttpErrorFilter } from './http-exception.filter.js';
import { getStorageDriver } from './storage/index.js';
import { TaskDecisionService } from './task-decisions.js';
import {
  TASK_SCHEDULER_CLOCK,
  TaskSchedulerService,
} from './task-scheduler.js';

describe('FW-028 task uploads', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let now = new Date('2026-11-09T10:30:00.000Z');
  const orgId = randomUUID();
  const siteId = randomUUID();
  const otherSiteId = randomUUID();
  const adminId = randomUUID();
  const managerId = randomUUID();
  const secondManagerId = randomUUID();
  const otherManagerId = randomUUID();
  const templateId = randomUUID();
  const adminToken = randomUUID();
  const managerToken = randomUUID();
  const secondManagerToken = randomUUID();
  const otherManagerToken = randomUUID();
  const adminCookie = `fw_session=${adminToken}`;
  const managerCookie = `fw_session=${managerToken}`;
  const secondManagerCookie = `fw_session=${secondManagerToken}`;
  const otherManagerCookie = `fw_session=${otherManagerToken}`;
  let nextOccurrence = 0;

  async function createTask(taskSiteId = siteId, taskDate = '2026-11-09') {
    const taskId = randomUUID();
    await pool.query(
      `INSERT INTO floorwalk.inspection_tasks
         (id, org_id, site_id, template_id, task_date, position, occurrence,
          starts_at, due_at)
       VALUES ($1, $2, $3, $4, $5::date, 0, $6,
         '2026-11-09T11:00:00Z', '2026-11-09T12:00:00Z')`,
      [taskId, orgId, taskSiteId, templateId, taskDate, nextOccurrence++],
    );
    return taskId;
  }

  function upload(
    taskId: string,
    position: number,
    cookie = managerCookie,
    selfAssessment = 'pass',
    note?: string,
    photoCount = 1,
  ) {
    let uploadRequest = request(app.getHttpServer())
      .post(`/api/tasks/${taskId}/items/${position}/uploads`)
      .set('Cookie', cookie)
      .field('selfAssessment', selfAssessment);
    if (note !== undefined) uploadRequest = uploadRequest.field('note', note);
    for (let index = 0; index < photoCount; index++)
      uploadRequest = uploadRequest.attach(
        'files',
        Buffer.from(`photo-${position}-${index}-${randomUUID()}`),
        { filename: `photo-${index}.jpg`, contentType: 'image/jpeg' },
      );
    return uploadRequest;
  }

  function decide(
    taskId: string,
    itemId: string,
    result: 'pass' | 'rework' | 'fail',
  ) {
    return request(app.getHttpServer())
      .post(`/api/tasks/${taskId}/items/${itemId}/decision`)
      .set('Cookie', adminCookie)
      .send({ result });
  }

  beforeAll(async () => {
    await runMigrations();
    pool = createPool();
    const client = await pool.connect();
    const adminTokenHash = hashSessionId(adminToken);
    const managerTokenHash = hashSessionId(managerToken);
    const secondManagerTokenHash = hashSessionId(secondManagerToken);
    const otherManagerTokenHash = hashSessionId(otherManagerToken);
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO floorwalk.organizations (id, name) VALUES ($1, $2)',
        [orgId, `FW028-${orgId}`],
      );
      await client.query(
        `INSERT INTO floorwalk.sites (id, org_id, code, name)
         VALUES ($1, $3, 'A', 'FW-028 A'), ($2, $3, 'B', 'FW-028 B')`,
        [siteId, otherSiteId, orgId],
      );
      await client.query(
        `INSERT INTO floorwalk.users
           (id, org_id, login_name, password_hash, display_name, role, site_id)
         VALUES ($1, $5, 'admin@example.test', 'hash', 'Test admin', 'admin', NULL),
           ($2, $5, 'manager@example.test', 'hash', 'Test manager', 'store_manager', $6),
           ($3, $5, 'second-manager@example.test', 'hash', 'Second manager', 'store_manager', $6),
           ($4, $5, 'other-manager@example.test', 'hash', 'Other manager', 'store_manager', $7)`,
        [
          adminId,
          managerId,
          secondManagerId,
          otherManagerId,
          orgId,
          siteId,
          otherSiteId,
        ],
      );
      await client.query(
        `INSERT INTO floorwalk.sessions (token_hash, user_id, expires_at)
         VALUES ($1, $2, now() + interval '7 days'),
           ($3, $4, now() + interval '7 days'),
           ($5, $6, now() + interval '7 days'),
           ($7, $8, now() + interval '7 days')`,
        [
          adminTokenHash,
          adminId,
          managerTokenHash,
          managerId,
          secondManagerTokenHash,
          secondManagerId,
          otherManagerTokenHash,
          otherManagerId,
        ],
      );
      await client.query(
        `INSERT INTO floorwalk.templates (id, org_id, name, ai_enabled)
         VALUES ($1, $2, 'FW-028 upload template', false)`,
        [templateId, orgId],
      );
      await client.query(
        `INSERT INTO floorwalk.template_items
           (template_id, position, title, min_photo_count, acceptance_criteria, critical)
         VALUES ($1, 1, '照片项', 1, '至少一张照片', false),
           ($1, 2, '备注项', 0, '', false),
           ($1, 3, '严重备注项', 0, '', true)`,
        [templateId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TASK_SCHEDULER_CLOCK)
      .useValue({ now: () => new Date(now) })
      .overrideProvider(TaskSchedulerService)
      .useValue({ syncSitesToday: async () => undefined })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    if (pool) {
      const evidence = await pool.query<{ storageKey: string }>(
        `SELECT e.storage_key AS "storageKey" FROM floorwalk.evidence e
         JOIN floorwalk.inspection_items item ON item.id = e.inspection_item_id
         JOIN floorwalk.inspections inspection ON inspection.id = item.inspection_id
         JOIN floorwalk.inspection_tasks task ON task.id = inspection.task_id
         WHERE task.org_id = $1`,
        [orgId],
      );
      const storage = await getStorageDriver();
      for (const row of evidence.rows)
        await storage.delete(row.storageKey).catch(() => undefined);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `DELETE FROM floorwalk.inspection_item_decisions WHERE inspection_item_id IN (
             SELECT item.id FROM floorwalk.inspection_items item
             JOIN floorwalk.inspections inspection ON inspection.id = item.inspection_id
             JOIN floorwalk.inspection_tasks task ON task.id = inspection.task_id
             WHERE task.org_id = $1)`,
          [orgId],
        );
        await client.query(
          `DELETE FROM floorwalk.evidence WHERE inspection_item_id IN (
             SELECT item.id FROM floorwalk.inspection_items item
             JOIN floorwalk.inspections inspection ON inspection.id = item.inspection_id
             JOIN floorwalk.inspection_tasks task ON task.id = inspection.task_id
             WHERE task.org_id = $1)`,
          [orgId],
        );
        await client.query(
          `DELETE FROM floorwalk.inspection_participants WHERE inspection_id IN (
             SELECT id FROM floorwalk.inspections WHERE task_id IN
               (SELECT id FROM floorwalk.inspection_tasks WHERE org_id = $1))`,
          [orgId],
        );
        await client.query(
          `DELETE FROM floorwalk.inspection_items WHERE inspection_id IN (
             SELECT id FROM floorwalk.inspections WHERE task_id IN
               (SELECT id FROM floorwalk.inspection_tasks WHERE org_id = $1))`,
          [orgId],
        );
        await client.query(
          'DELETE FROM floorwalk.inspections WHERE task_id IN (SELECT id FROM floorwalk.inspection_tasks WHERE org_id = $1)',
          [orgId],
        );
        await client.query(
          'DELETE FROM floorwalk.inspection_tasks WHERE org_id = $1',
          [orgId],
        );
        await client.query(
          'DELETE FROM floorwalk.template_items WHERE template_id = $1',
          [templateId],
        );
        await client.query('DELETE FROM floorwalk.templates WHERE id = $1', [
          templateId,
        ]);
        await client.query(
          'DELETE FROM floorwalk.sessions WHERE user_id = ANY($1::uuid[])',
          [[adminId, managerId, secondManagerId, otherManagerId]],
        );
        await client.query(
          'DELETE FROM floorwalk.users WHERE id = ANY($1::uuid[])',
          [[adminId, managerId, secondManagerId, otherManagerId]],
        );
        await client.query(
          'DELETE FROM floorwalk.sites WHERE id = ANY($1::uuid[])',
          [[siteId, otherSiteId]],
        );
        await client.query(
          'DELETE FROM floorwalk.organizations WHERE id = $1',
          [orgId],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      await pool.end();
    }
  }, 60000);

  it('lists only this store’s tasks for its timezone date', async () => {
    const currentTaskId = await createTask();
    const otherSiteTaskId = await createTask(otherSiteId);
    const nextDayTaskId = await createTask(siteId, '2026-11-10');
    const response = await request(app.getHttpServer())
      .get('/api/inspector/today')
      .set('Cookie', managerCookie)
      .expect(200);
    const today = todayResponseSchema.parse(response.body);

    expect(today.timezone).toBe('Asia/Shanghai');
    expect(today.tasks.map((task) => task.id)).toContain(currentTaskId);
    expect(today.tasks.map((task) => task.id)).not.toContain(otherSiteTaskId);
    expect(today.tasks.map((task) => task.id)).not.toContain(nextDayTaskId);
    expect(
      today.tasks.find((task) => task.id === currentTaskId)?.templateName,
    ).toBe('FW-028 upload template');
  });

  it('serializes first uploads and replaces each item as one submission', async () => {
    now = new Date('2026-11-09T10:30:00.000Z');
    const taskId = await createTask();
    const [photoUpload, noteUpload, criticalNoteUpload] = await Promise.all([
      upload(taskId, 1, managerCookie).expect(201),
      upload(taskId, 2, secondManagerCookie, 'fail', '无需拍照').expect(201),
      upload(taskId, 3, managerCookie, 'pass', '严重项已检查', 0).expect(201),
    ]);
    expect(photoUpload.body.uploadedByName).toBe('Test manager');
    expect(noteUpload.body.uploadedByName).toBe('Second manager');
    expect(criticalNoteUpload.body.uploadedByName).toBe('Test manager');
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM floorwalk.inspections WHERE task_id = $1',
          [taskId],
        )
      ).rows[0].count,
    ).toBe('1');
    expect(
      (
        await pool.query(
          'SELECT status FROM floorwalk.inspection_tasks WHERE id = $1',
          [taskId],
        )
      ).rows[0].status,
    ).toBe('submitted');

    await pool.query(
      `UPDATE floorwalk.inspection_items SET result = 'pass'
       WHERE inspection_id = (SELECT id FROM floorwalk.inspections WHERE task_id = $1)
         AND position = 1`,
      [taskId],
    );
    const replacement = await upload(
      taskId,
      1,
      secondManagerCookie,
      'fail',
      undefined,
      2,
    ).expect(201);
    expect(replacement.body.result).toBe('pending');
    expect(replacement.body.selfAssessment).toBe('fail');
    expect(replacement.body.evidence).toHaveLength(2);
    const item = await pool.query<{
      firstSelfAssessment: string;
      selfAssessment: string;
      uploadedById: string;
      evidenceCount: string;
    }>(
      `SELECT item.first_self_assessment AS "firstSelfAssessment",
         item.self_assessment AS "selfAssessment", item.uploaded_by_id AS "uploadedById",
         (SELECT count(*)::text FROM floorwalk.evidence e
           WHERE e.inspection_item_id = item.id) AS "evidenceCount"
       FROM floorwalk.inspection_items item
       WHERE item.inspection_id = (SELECT id FROM floorwalk.inspections WHERE task_id = $1)
         AND item.position = 1`,
      [taskId],
    );
    expect(item.rows[0]).toMatchObject({
      firstSelfAssessment: 'pass',
      selfAssessment: 'fail',
      uploadedById: secondManagerId,
      evidenceCount: '2',
    });
    await upload(taskId, 2, managerCookie, 'pass', undefined, 0).expect(422);
    await upload(taskId, 1, otherManagerCookie).expect(403);
  });

  it('enforces the upload window, minimum evidence, overdue status and rework grace', async () => {
    const taskId = await createTask();
    now = new Date('2026-11-09T09:59:59.999Z');
    await upload(taskId, 1).expect(409);
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM floorwalk.inspections WHERE task_id = $1',
          [taskId],
        )
      ).rows[0].count,
    ).toBe('0');

    now = new Date('2026-11-09T10:00:00.000Z');
    await upload(taskId, 1, managerCookie, 'pass', undefined, 0).expect(422);
    await upload(taskId, 1).expect(201);
    const scheduler = new TaskSchedulerService(
      pool,
      { now: () => new Date(now) },
      new TaskDecisionService(pool),
    );
    now = new Date('2026-11-09T12:00:00.000Z');
    await scheduler.expireDueTasks();
    expect(
      (
        await pool.query(
          'SELECT status FROM floorwalk.inspection_tasks WHERE id = $1',
          [taskId],
        )
      ).rows[0].status,
    ).toBe('overdue');
    now = new Date('2026-11-09T12:00:00.001Z');
    await upload(taskId, 1).expect(409);
    await pool.query(
      `UPDATE floorwalk.inspection_items SET result = 'rework'
       WHERE inspection_id = (SELECT id FROM floorwalk.inspections WHERE task_id = $1)
         AND position = 1`,
      [taskId],
    );
    now = new Date('2026-11-09T12:59:59.999Z');
    const reupload = await upload(taskId, 1).expect(201);
    expect(reupload.body.result).toBe('pending');
    await pool.query(
      `UPDATE floorwalk.inspection_items SET result = 'rework'
       WHERE inspection_id = (SELECT id FROM floorwalk.inspections WHERE task_id = $1)
         AND position = 1`,
      [taskId],
    );
    now = new Date('2026-11-09T13:00:00.000Z');
    await upload(taskId, 1).expect(201);
    await pool.query(
      `UPDATE floorwalk.inspection_items SET result = 'rework'
       WHERE inspection_id = (SELECT id FROM floorwalk.inspections WHERE task_id = $1)
         AND position = 1`,
      [taskId],
    );
    now = new Date('2026-11-09T13:00:00.001Z');
    await upload(taskId, 1).expect(409);
  });

  it('locks the deadline score, preserves first decisions and records each rejudge', async () => {
    now = new Date('2026-11-09T10:30:00.000Z');
    const taskId = await createTask();
    await Promise.all([
      upload(taskId, 1).expect(201),
      upload(taskId, 2, managerCookie, 'pass', '已检查', 0).expect(201),
      upload(taskId, 3, managerCookie, 'pass', '严重项已检查', 0).expect(201),
    ]);
    const queue = await request(app.getHttpServer())
      .get('/api/review/tasks')
      .set('Cookie', adminCookie)
      .expect(200);
    const review = queue.body.find(
      (entry: { id: string }) => entry.id === taskId,
    );
    expect(review.items).toHaveLength(3);
    expect(review.items[0]).toMatchObject({
      uploadedByName: 'Test manager',
      selfAssessment: 'pass',
    });
    await request(app.getHttpServer())
      .get('/api/review/tasks')
      .set('Cookie', managerCookie)
      .expect(403);

    const byPosition = (position: number) =>
      review.items.find(
        (item: { position: number }) => item.position === position,
      ).id as string;
    await decide(taskId, byPosition(1), 'pass').expect(201);
    await decide(taskId, byPosition(2), 'fail').expect(201);
    const finalItemDecision = await decide(
      taskId,
      byPosition(3),
      'pass',
    ).expect(201);
    expect(finalItemDecision.body.score).toBeNull();

    const decisions = new TaskDecisionService(pool);
    const scheduler = new TaskSchedulerService(
      pool,
      { now: () => new Date(now) },
      decisions,
    );
    now = new Date('2026-11-09T12:00:00.000Z');
    await scheduler.expireDueTasks(now);
    await decisions.processDueTasks(now);
    const locked = await request(app.getHttpServer())
      .get(`/api/tasks/${taskId}/review`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(locked.body).toMatchObject({
      score: 67,
      inspectionStatus: 'passed',
      decidedAt: '2026-11-09T12:00:00.000Z',
    });
    expect(
      locked.body.items.map(
        (item: { firstResult: string }) => item.firstResult,
      ),
    ).toEqual(['pass', 'fail', 'pass']);

    now = new Date('2026-11-09T12:01:00.000Z');
    const failedAgain = await decide(taskId, byPosition(3), 'fail').expect(201);
    expect(failedAgain.body).toMatchObject({
      score: 33,
      inspectionStatus: 'failed',
      decidedAt: '2026-11-09T12:00:00.000Z',
    });
    now = new Date('2026-11-09T12:02:00.000Z');
    const rejudged = await decide(taskId, byPosition(3), 'pass').expect(201);
    expect(rejudged.body).toMatchObject({
      score: 67,
      inspectionStatus: 'passed',
      decidedAt: '2026-11-09T12:00:00.000Z',
    });
    const audit = await pool.query<{
      actorId: string;
      previousResult: string | null;
      newResult: string;
      createdAt: Date;
    }>(
      `SELECT actor_id AS "actorId", previous_result AS "previousResult",
         new_result AS "newResult", created_at AS "createdAt"
       FROM floorwalk.inspection_item_decisions WHERE inspection_item_id = $1
       ORDER BY created_at, id`,
      [byPosition(3)],
    );
    expect(audit.rows).toHaveLength(3);
    expect(
      audit.rows.map((row) => [row.previousResult, row.newResult]),
    ).toEqual([
      [null, 'pass'],
      ['pass', 'fail'],
      ['fail', 'pass'],
    ]);
    expect(audit.rows.every((row) => row.actorId === adminId)).toBe(true);
    expect(audit.rows.map((row) => row.createdAt.toISOString())).toEqual([
      '2026-11-09T10:30:00.000Z',
      '2026-11-09T12:01:00.000Z',
      '2026-11-09T12:02:00.000Z',
    ]);
  });

  it('creates and finalizes an empty inspection when a task reaches its deadline without uploads', async () => {
    const taskId = await createTask();
    now = new Date('2026-11-09T12:00:00.000Z');
    const decisions = new TaskDecisionService(pool);
    const scheduler = new TaskSchedulerService(
      pool,
      { now: () => new Date(now) },
      decisions,
    );
    await scheduler.expireDueTasks(now);
    await decisions.processDueTasks(now);
    const outcome = await pool.query<{
      inspectorId: string | null;
      status: string;
      score: number;
      decidedAt: Date;
      taskStatus: string;
      itemCount: string;
      failedCount: string;
      incompleteCount: string;
      firstResultCount: string;
    }>(
      `SELECT inspection.inspector_id AS "inspectorId", inspection.status,
         inspection.score, inspection.decided_at AS "decidedAt", task.status AS "taskStatus",
         count(item.id)::text AS "itemCount",
         count(item.id) FILTER (WHERE item.result = 'fail')::text AS "failedCount",
         count(item.id) FILTER (WHERE item.incomplete)::text AS "incompleteCount",
         count(item.id) FILTER (WHERE item.first_result = 'fail')::text AS "firstResultCount"
       FROM floorwalk.inspections inspection
       JOIN floorwalk.inspection_tasks task ON task.id = inspection.task_id
       JOIN floorwalk.inspection_items item ON item.inspection_id = inspection.id
       WHERE task.id = $1
       GROUP BY inspection.id, task.id`,
      [taskId],
    );
    expect(outcome.rows[0]).toMatchObject({
      inspectorId: null,
      status: 'failed',
      score: 0,
      decidedAt: new Date('2026-11-09T12:00:00.000Z'),
      taskStatus: 'overdue',
      itemCount: '3',
      failedCount: '3',
      incompleteCount: '3',
      firstResultCount: '3',
    });
  });

  it('waits for rework until its conclusion or forces it to incomplete failure at one hour', async () => {
    now = new Date('2026-11-09T10:30:00.000Z');
    const resolvedTaskId = await createTask();
    await Promise.all([
      upload(resolvedTaskId, 1).expect(201),
      upload(resolvedTaskId, 2, managerCookie, 'pass', '已检查', 0).expect(201),
      upload(
        resolvedTaskId,
        3,
        managerCookie,
        'pass',
        '严重项已检查',
        0,
      ).expect(201),
    ]);
    const unresolved = await request(app.getHttpServer())
      .get(`/api/tasks/${resolvedTaskId}/review`)
      .set('Cookie', adminCookie)
      .expect(200);
    const firstItemId = unresolved.body.items.find(
      (item: { position: number }) => item.position === 1,
    ).id as string;
    await decide(resolvedTaskId, firstItemId, 'rework').expect(201);
    const decisions = new TaskDecisionService(pool);
    now = new Date('2026-11-09T12:00:00.000Z');
    await decisions.processDueTasks(now);
    const current = await pool.query<{ decidedAt: Date | null }>(
      `SELECT decided_at AS "decidedAt" FROM floorwalk.inspections
       WHERE task_id = $1`,
      [resolvedTaskId],
    );
    expect(current.rows[0].decidedAt).toBeNull();
    now = new Date('2026-11-09T12:30:00.000Z');
    const resolved = await decide(resolvedTaskId, firstItemId, 'pass').expect(
      201,
    );
    expect(resolved.body.decidedAt).toBe('2026-11-09T12:30:00.000Z');

    now = new Date('2026-11-09T10:30:00.000Z');
    const forcedTaskId = await createTask();
    await Promise.all([
      upload(forcedTaskId, 1).expect(201),
      upload(forcedTaskId, 2, managerCookie, 'pass', '已检查', 0).expect(201),
      upload(forcedTaskId, 3, managerCookie, 'pass', '严重项已检查', 0).expect(
        201,
      ),
    ]);
    const forcedReview = await request(app.getHttpServer())
      .get(`/api/tasks/${forcedTaskId}/review`)
      .set('Cookie', adminCookie)
      .expect(200);
    const forcedItemId = forcedReview.body.items.find(
      (item: { position: number }) => item.position === 1,
    ).id as string;
    await decide(forcedTaskId, forcedItemId, 'rework').expect(201);
    now = new Date('2026-11-09T13:00:00.000Z');
    await decisions.processDueTasks(now);
    const forced = await request(app.getHttpServer())
      .get(`/api/tasks/${forcedTaskId}/review`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(forced.body).toMatchObject({
      inspectionStatus: 'failed',
      decidedAt: '2026-11-09T13:00:00.000Z',
    });
    expect(
      forced.body.items.find(
        (item: { id: string }) => item.id === forcedItemId,
      ),
    ).toMatchObject({
      result: 'fail',
      incomplete: true,
      firstResult: 'rework',
    });
    await decide(forcedTaskId, forcedItemId, 'rework').expect(409);
  });
});
