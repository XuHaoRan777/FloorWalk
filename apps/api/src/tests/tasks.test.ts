import { randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import {
  errorResponseSchema,
  inspectorTaskDetailSchema,
  selfCheckStatsResponseSchema,
  todayResponseSchema,
} from '@libs/shared';
import { AppModule } from '../app.module.js';
import { hashSessionId } from '../auth/auth.js';
import { createPool } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { HttpErrorFilter } from '../filters/http-exception.filter.js';
import { getStorageDriver } from '../storage/index.js';
import { TaskDecisionService } from '../services/task-decisions.js';
import { AiReviewQueueService } from '../services/ai-review-queue.js';
import { FakeAiReviewer } from '../ai/fake.js';
import type { AiReviewer } from '../ai/types.js';
import {
  TASK_SCHEDULER_CLOCK,
  TaskSchedulerService,
} from '../services/task-scheduler.js';

describe('FW-028 task uploads', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let aiQueue: AiReviewQueueService;
  let reviewer: AiReviewer = new FakeAiReviewer();
  let now = new Date('2026-11-09T10:30:00.000Z');
  const orgId = randomUUID();
  const siteId = randomUUID();
  const otherSiteId = randomUUID();
  const adminId = randomUUID();
  const managerId = randomUUID();
  const secondManagerId = randomUUID();
  const otherManagerId = randomUUID();
  const templateId = randomUUID();
  const standardId = randomUUID();
  const adminToken = randomUUID();
  const managerToken = randomUUID();
  const secondManagerToken = randomUUID();
  const otherManagerToken = randomUUID();
  const adminCookie = `fw_session=${adminToken}`;
  const managerCookie = `fw_session=${managerToken}`;
  const secondManagerCookie = `fw_session=${secondManagerToken}`;
  const otherManagerCookie = `fw_session=${otherManagerToken}`;
  let nextOccurrence = 0;

  async function createTask(
    taskSiteId: string = siteId,
    taskDate = '2026-11-09',
  ) {
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
      .send(
        result === 'rework'
          ? { result, reason: '请补充现场照片与说明。' }
          : { result },
      );
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
        `INSERT INTO floorwalk.ai_review_standards (id, org_id, name, prompt)
         VALUES ($1, $2, 'FW-030 test standard', '按条目要求审核。')`,
        [standardId, orgId],
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
    aiQueue = new AiReviewQueueService(
      pool,
      { review: (input) => reviewer.review(input) },
      { now: () => new Date(now) },
      new TaskDecisionService(pool),
    );
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiReviewQueueService)
      .useValue({ enqueue: aiQueue.enqueue.bind(aiQueue) })
      .overrideProvider(TASK_SCHEDULER_CLOCK)
      .useValue({ now: () => new Date(now) })
      .overrideProvider(TaskSchedulerService)
      .useValue({ syncSitesToday: async () => undefined })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
  }, 60000);

  beforeEach(async () => {
    reviewer = new FakeAiReviewer();
    await pool.query(
      `UPDATE floorwalk.templates SET ai_enabled = false, ai_standard_id = $2
       WHERE id = $1`,
      [templateId, standardId],
    );
  });

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
          'DELETE FROM floorwalk.ai_review_standards WHERE id = $1',
          [standardId],
        );
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

  it('returns the task detail only to its assigned store managers', async () => {
    const taskId = await createTask();
    await request(app.getHttpServer())
      .get(`/api/inspector/tasks/${taskId}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/inspector/tasks/${taskId}`)
      .set('Cookie', adminCookie)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/inspector/tasks/${taskId}`)
      .set('Cookie', otherManagerCookie)
      .expect(404);

    const response = await request(app.getHttpServer())
      .get(`/api/inspector/tasks/${taskId}`)
      .set('Cookie', managerCookie)
      .expect(200);
    const detail = inspectorTaskDetailSchema.parse(response.body);
    expect(detail).toMatchObject({
      id: taskId,
      siteId,
      templateId,
      timezone: 'Asia/Shanghai',
      templateName: 'FW-028 upload template',
      inspectionId: null,
      inspectionStatus: null,
    });
    expect(detail.items).toHaveLength(3);
    expect(detail.items[0]).toMatchObject({
      position: 1,
      title: '照片项',
      minPhotoCount: 1,
      acceptanceCriteria: '至少一张照片',
      result: 'pending',
      uploadedByName: null,
      uploadedAt: null,
    });
    expect(detail.items[1]).toMatchObject({
      position: 2,
      title: '备注项',
      minPhotoCount: 0,
      result: 'pending',
      uploadedByName: null,
      uploadedAt: null,
    });
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
    await pool.query(
      `UPDATE floorwalk.template_items SET title = '已更改模板标题',
         acceptance_criteria = '已更改模板要点'
       WHERE template_id = $1 AND position = 1`,
      [templateId],
    );
    const detail = await request(app.getHttpServer())
      .get(`/api/inspector/tasks/${taskId}`)
      .set('Cookie', managerCookie)
      .expect(200);
    expect(detail.body.items[0]).toMatchObject({
      title: '照片项',
      acceptanceCriteria: '至少一张照片',
      result: 'pending',
      uploadedByName: 'Second manager',
      uploadedAt: '2026-11-09T10:30:00.000Z',
    });
    expect(detail.body.items[0]).not.toHaveProperty('note');
    expect(detail.body.items[0]).not.toHaveProperty('evidence');
    expect(detail.body.items[0]).not.toHaveProperty('selfAssessment');
    await pool.query(
      `UPDATE floorwalk.template_items SET title = '照片项',
         acceptance_criteria = '至少一张照片'
       WHERE template_id = $1 AND position = 1`,
      [templateId],
    );
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
    const reworked = await decide(resolvedTaskId, firstItemId, 'rework').expect(
      201,
    );
    expect(
      reworked.body.items.find(
        (item: { id: string }) => item.id === firstItemId,
      ),
    ).toMatchObject({
      result: 'rework',
      lastReworkReason: '请补充现场照片与说明。',
    });
    const reasonAudit = await pool.query<{ reason: string }>(
      `SELECT reason FROM floorwalk.inspection_item_decisions
       WHERE inspection_item_id = $1 AND new_result = 'rework'`,
      [firstItemId],
    );
    expect(reasonAudit.rows).toEqual([{ reason: '请补充现场照片与说明。' }]);
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

  it('FW-030 skips the queue for disabled AI and exposes the pending manual review', async () => {
    now = new Date('2026-11-09T10:30:00.000Z');
    const taskId = await createTask();
    const uploaded = await upload(
      taskId,
      2,
      managerCookie,
      'pass',
      '已检查',
      0,
    ).expect(201);
    const review = vi.fn();
    reviewer = { review };
    await aiQueue.processPending();
    expect(review).not.toHaveBeenCalled();
    const jobs = await pool.query(
      'SELECT id FROM floorwalk.ai_review_jobs WHERE inspection_item_id = $1',
      [uploaded.body.id],
    );
    expect(jobs.rowCount).toBe(0);
    const detail = await request(app.getHttpServer())
      .get(`/api/tasks/${taskId}/review`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(detail.body.items[1]).toMatchObject({
      result: 'pending',
      aiReviewStatus: 'manual',
      aiReason: null,
    });
    await decide(taskId, uploaded.body.id, 'pass').expect(201);
  });

  it('FW-031 AC-01 lists pending manual tasks and decisions made today only', async () => {
    now = new Date('2026-11-09T10:30:00.000Z');
    const manualTaskId = await createTask();
    const manualItem = await upload(
      manualTaskId,
      2,
      managerCookie,
      'pass',
      '待管理员处理',
      0,
    ).expect(201);

    const decidedTodayTaskId = await createTask();
    const decidedTodayItem = await upload(
      decidedTodayTaskId,
      2,
      managerCookie,
      'pass',
      '今天完成',
      0,
    ).expect(201);
    await decide(decidedTodayTaskId, decidedTodayItem.body.id, 'pass').expect(
      201,
    );
    await pool.query(
      `UPDATE floorwalk.inspections SET status = 'passed', score = 100,
         decided_at = now() WHERE task_id = $1`,
      [decidedTodayTaskId],
    );

    const decidedEarlierTaskId = await createTask();
    const decidedEarlierItem = await upload(
      decidedEarlierTaskId,
      2,
      managerCookie,
      'pass',
      '昨日完成',
      0,
    ).expect(201);
    await decide(
      decidedEarlierTaskId,
      decidedEarlierItem.body.id,
      'pass',
    ).expect(201);
    await pool.query(
      `UPDATE floorwalk.inspections SET status = 'passed', score = 100,
         decided_at = now() - interval '1 day' WHERE task_id = $1`,
      [decidedEarlierTaskId],
    );

    const queue = await request(app.getHttpServer())
      .get('/api/review/tasks')
      .set('Cookie', adminCookie)
      .expect(200);
    const taskIds = queue.body.map((task: { id: string }) => task.id);
    expect(taskIds).toContain(manualTaskId);
    expect(taskIds).toContain(decidedTodayTaskId);
    expect(taskIds).not.toContain(decidedEarlierTaskId);

    await pool.query(
      'UPDATE floorwalk.templates SET ai_enabled = true WHERE id = $1',
      [templateId],
    );
    const afterEnablingAi = await request(app.getHttpServer())
      .get('/api/review/tasks')
      .set('Cookie', adminCookie)
      .expect(200);
    const stillManual = afterEnablingAi.body.find(
      (task: { id: string }) => task.id === manualTaskId,
    );
    expect(stillManual).toBeDefined();
    expect(
      stillManual.items.find(
        (item: { id: string }) => item.id === manualItem.body.id,
      ),
    ).toMatchObject({ result: 'pending', aiReviewStatus: 'manual' });
    const decided = await decide(
      manualTaskId,
      manualItem.body.id,
      'pass',
    ).expect(201);
    expect(
      decided.body.items.find(
        (item: { id: string }) => item.id === manualItem.body.id,
      ).result,
    ).toBe('pass');
  });

  it('FW-030 cancels an unstarted upload even when its replacement has the same timestamp', async () => {
    now = new Date('2026-11-09T10:30:00.000Z');
    await pool.query(
      'UPDATE floorwalk.templates SET ai_enabled = true WHERE id = $1',
      [templateId],
    );
    const taskId = await createTask();
    const first = await upload(
      taskId,
      2,
      managerCookie,
      'pass',
      '第一次',
      0,
    ).expect(201);
    await upload(taskId, 2, secondManagerCookie, 'fail', '替换', 0).expect(201);
    const review = vi.fn((input: Parameters<AiReviewer['review']>[0]) =>
      new FakeAiReviewer().review(input),
    );
    reviewer = { review };
    await aiQueue.processPending();
    expect(review).toHaveBeenCalledTimes(1);
    expect(review.mock.calls[0][0].items[0]).toMatchObject({
      selfResult: 'fail',
      expectedConclusion: 'fail',
    });
    const jobs = await pool.query(
      `SELECT upload_version AS version, status, attempt_count AS attempts
       FROM floorwalk.ai_review_jobs WHERE inspection_item_id = $1 ORDER BY upload_version`,
      [first.body.id],
    );
    expect(jobs.rows).toEqual([
      { version: 1, status: 'cancelled', attempts: 0 },
      { version: 2, status: 'completed', attempts: 1 },
    ]);
  });

  it('FW-030 retries at exponential intervals three times before requesting manual judgment', async () => {
    now = new Date('2026-11-09T10:30:00.000Z');
    await pool.query(
      'UPDATE floorwalk.templates SET ai_enabled = true WHERE id = $1',
      [templateId],
    );
    const taskId = await createTask();
    const uploaded = await upload(
      taskId,
      2,
      managerCookie,
      'pass',
      '待审核',
      0,
    ).expect(201);
    const review = vi
      .fn<AiReviewer['review']>()
      .mockRejectedValueOnce(new Error('test transport failure'))
      .mockResolvedValue({ kind: 'needs_human', reason: '测试模型不可用。' });
    reviewer = { review };
    for (let attempt = 1; attempt <= 4; attempt++) {
      await aiQueue.processPending();
      const jobs = await pool.query(
        `SELECT status, attempt_count AS attempts, available_at AS available
         FROM floorwalk.ai_review_jobs WHERE inspection_item_id = $1`,
        [uploaded.body.id],
      );
      expect(review).toHaveBeenCalledTimes(attempt);
      expect(jobs.rows[0]).toMatchObject({
        status: attempt === 4 ? 'manual' : 'pending',
        attempts: attempt,
      });
      if (attempt < 4) {
        const due = new Date(now.getTime() + 1_000 * 2 ** (attempt - 1));
        expect(jobs.rows[0].available).toEqual(due);
        now = new Date(due.getTime() - 1);
        await aiQueue.processPending();
        expect(review).toHaveBeenCalledTimes(attempt);
        now = due;
      }
    }
    now = new Date(now.getTime() + 60_000);
    await aiQueue.processPending();
    expect(review).toHaveBeenCalledTimes(4);
    const detail = await request(app.getHttpServer())
      .get(`/api/tasks/${taskId}/review`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(detail.body.items[1]).toMatchObject({
      result: 'pending',
      firstResult: null,
      aiReviewStatus: 'manual',
      aiReason: '测试模型不可用。',
    });
    const decided = await decide(taskId, uploaded.body.id, 'fail').expect(201);
    expect(decided.body.items[1]).toMatchObject({
      result: 'fail',
      firstResult: 'fail',
    });
  });

  it('FW-030 prevents an in-flight old result from overwriting the replacement', async () => {
    now = new Date('2026-11-09T10:30:00.000Z');
    await pool.query(
      'UPDATE floorwalk.templates SET ai_enabled = true WHERE id = $1',
      [templateId],
    );
    const taskId = await createTask();
    const uploaded = await upload(
      taskId,
      2,
      managerCookie,
      'pass',
      '第一次',
      0,
    ).expect(201);
    let release: () => void = () => undefined;
    let started: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const claimed = new Promise<void>((resolve) => {
      started = resolve;
    });
    const review = vi.fn<AiReviewer['review']>(async (input) => {
      if (review.mock.calls.length === 1) {
        started();
        await gate;
      }
      return new FakeAiReviewer().review(input);
    });
    reviewer = { review };
    const processing = aiQueue.processPending();
    await claimed;
    await upload(taskId, 2, secondManagerCookie, 'fail', '替换', 0).expect(201);
    release();
    await processing;
    const item = await pool.query(
      'SELECT result, first_result FROM floorwalk.inspection_items WHERE id = $1',
      [uploaded.body.id],
    );
    expect(item.rows[0]).toEqual({ result: 'fail', first_result: 'fail' });
    expect(review).toHaveBeenCalledTimes(2);
  });

  it('FW-030 keeps first results through repeated AI rework and uses the grace conclusion time', async () => {
    now = new Date('2026-11-09T10:30:00.000Z');
    await pool.query(
      'UPDATE floorwalk.templates SET ai_enabled = true WHERE id = $1',
      [templateId],
    );
    const taskId = await createTask();
    await upload(taskId, 1).expect(201);
    const item = await upload(
      taskId,
      2,
      managerCookie,
      'pass',
      '首次自检',
      0,
    ).expect(201);
    await upload(taskId, 3, managerCookie, 'pass', '已检查', 0).expect(201);
    await aiQueue.processPending();
    const initial = await request(app.getHttpServer())
      .get(`/api/tasks/${taskId}/review`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(initial.body.score).toBeNull();
    expect(initial.body.items[1]).toMatchObject({
      result: 'pass',
      firstSelfAssessment: 'pass',
      firstResult: 'pass',
      aiReviewStatus: 'completed',
      aiReason: '模拟审核通过。',
    });

    reviewer = {
      review: (input) =>
        new FakeAiReviewer().review({
          ...input,
          items: input.items.map((entry) => ({
            ...entry,
            expectedConclusion: 'rework',
          })),
        }),
    };
    for (let attempt = 0; attempt < 4; attempt++) {
      now = new Date(now.getTime() + 60_000);
      await upload(taskId, 2, secondManagerCookie, 'fail', '补传', 0).expect(
        201,
      );
      await aiQueue.processPending();
      const reworked = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}/review`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(reworked.body.items[1]).toMatchObject({
        result: 'rework',
        firstSelfAssessment: 'pass',
        firstResult: 'pass',
        aiReason: '模拟审核打回。',
      });
    }
    const decisions = new TaskDecisionService(pool);
    now = new Date('2026-11-09T12:00:00.000Z');
    await decisions.processDueTasks(now);
    const waiting = await pool.query(
      'SELECT decided_at FROM floorwalk.inspections WHERE task_id = $1',
      [taskId],
    );
    expect(waiting.rows[0].decided_at).toBeNull();

    now = new Date('2026-11-09T12:30:00.000Z');
    reviewer = new FakeAiReviewer();
    await upload(
      taskId,
      2,
      secondManagerCookie,
      'fail',
      '属实不合格',
      0,
    ).expect(201);
    await aiQueue.processPending();
    const settled = await request(app.getHttpServer())
      .get(`/api/tasks/${taskId}/review`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(settled.body).toMatchObject({
      score: 67,
      inspectionStatus: 'passed',
      decidedAt: '2026-11-09T12:30:00.000Z',
    });
    expect(settled.body.items[1]).toMatchObject({
      result: 'fail',
      firstSelfAssessment: 'pass',
      firstResult: 'pass',
      aiReason: '模拟审核不合格。',
    });
    const attribution = await pool.query(
      'SELECT first_uploaded_by_id FROM floorwalk.inspection_items WHERE id = $1',
      [item.body.id],
    );
    expect(attribution.rows[0].first_uploaded_by_id).toBe(managerId);
    const changed = await decide(taskId, item.body.id, 'pass').expect(201);
    expect(changed.body.decidedAt).toBe('2026-11-09T12:30:00.000Z');
    expect(changed.body.items[1].firstResult).toBe('pass');
  });

  it('FW-030 locks normal AI results at the deadline and unresolved rework at one hour', async () => {
    now = new Date('2026-11-09T10:30:00.000Z');
    await pool.query(
      'UPDATE floorwalk.templates SET ai_enabled = true WHERE id = $1',
      [templateId],
    );
    const normalTaskId = await createTask();
    const reworkTaskId = await createTask();
    for (const taskId of [normalTaskId, reworkTaskId]) {
      await upload(taskId, 1).expect(201);
      await upload(taskId, 2, managerCookie, 'pass', '已检查', 0).expect(201);
      await upload(taskId, 3, managerCookie, 'pass', '已检查', 0).expect(201);
    }
    await aiQueue.processPending();
    reviewer = {
      review: (input) =>
        new FakeAiReviewer().review({
          ...input,
          items: input.items.map((entry) => ({
            ...entry,
            expectedConclusion: 'rework',
          })),
        }),
    };
    const reworked = await upload(
      reworkTaskId,
      2,
      managerCookie,
      'pass',
      '待补传',
      0,
    ).expect(201);
    await aiQueue.processPending();
    const decisions = new TaskDecisionService(pool);
    now = new Date('2026-11-09T12:00:00.000Z');
    await decisions.processDueTasks(now);
    const normal = await request(app.getHttpServer())
      .get(`/api/tasks/${normalTaskId}/review`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(normal.body).toMatchObject({
      score: 100,
      inspectionStatus: 'passed',
      decidedAt: '2026-11-09T12:00:00.000Z',
    });
    now = new Date('2026-11-09T13:00:00.000Z');
    await decisions.processDueTasks(now);
    const forced = await request(app.getHttpServer())
      .get(`/api/tasks/${reworkTaskId}/review`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(forced.body).toMatchObject({
      score: 67,
      decidedAt: '2026-11-09T13:00:00.000Z',
    });
    expect(forced.body.items[1]).toMatchObject({
      id: reworked.body.id,
      result: 'fail',
      incomplete: true,
      firstResult: 'pass',
    });
  });

  it('FW-030 calculates self-check accuracy from first decisions and first uploaders by task date', async () => {
    now = new Date('2026-11-09T10:30:00.000Z');
    const firstTask = await createTask(siteId, '2026-10-01');
    const firstPass = await upload(firstTask, 1).expect(201);
    const reworked = await upload(
      firstTask,
      2,
      secondManagerCookie,
      'fail',
      '首次不合格',
      0,
    ).expect(201);
    await upload(firstTask, 3, managerCookie, 'pass', '尚未判定', 0).expect(
      201,
    );
    await decide(firstTask, firstPass.body.id, 'pass').expect(201);
    await decide(firstTask, reworked.body.id, 'rework').expect(201);
    await upload(firstTask, 2, managerCookie, 'pass', '另一店长补传', 0).expect(
      201,
    );
    await decide(firstTask, reworked.body.id, 'fail').expect(201);

    const secondTask = await createTask(siteId, '2026-10-02');
    const secondFail = await upload(
      secondTask,
      2,
      secondManagerCookie,
      'fail',
      '不合格',
      0,
    ).expect(201);
    const mismatched = await upload(
      secondTask,
      3,
      managerCookie,
      'pass',
      '自检合格',
      0,
    ).expect(201);
    await decide(secondTask, secondFail.body.id, 'fail').expect(201);
    await decide(secondTask, mismatched.body.id, 'fail').expect(201);
    for (const [taskSiteId, taskDate, cookie] of [
      [siteId, '2026-10-03', managerCookie],
      [otherSiteId, '2026-10-01', otherManagerCookie],
    ]) {
      const excludedTask = await createTask(taskSiteId, taskDate);
      const excludedItem = await upload(
        excludedTask,
        2,
        cookie,
        'pass',
        '范围外',
        0,
      ).expect(201);
      await decide(excludedTask, excludedItem.body.id, 'pass').expect(201);
    }
    for (const [scope, id, sampleCount, matchingCount] of [
      ['site', siteId, 4, 2],
      ['manager', managerId, 2, 1],
      ['manager', secondManagerId, 2, 1],
    ]) {
      const response = await request(app.getHttpServer())
        .get('/api/stats/self-check')
        .query({ scope, id, from: '2026-10-01', to: '2026-10-02' })
        .set('Cookie', adminCookie)
        .expect(200);
      expect(selfCheckStatsResponseSchema.parse(response.body)).toEqual({
        sampleCount,
        matchingCount,
        accuracy: 0.5,
      });
    }
    const empty = await request(app.getHttpServer())
      .get('/api/stats/self-check')
      .query({
        scope: 'site',
        id: siteId,
        from: '2026-09-01',
        to: '2026-09-01',
      })
      .set('Cookie', adminCookie)
      .expect(200);
    expect(empty.body).toEqual({
      sampleCount: 0,
      matchingCount: 0,
      accuracy: null,
    });

    const legacyTask = await createTask(siteId, '2026-10-04');
    const legacyItem = await upload(
      legacyTask,
      2,
      managerCookie,
      'fail',
      '首传者未知的旧记录',
      0,
    ).expect(201);
    await pool.query(
      'UPDATE floorwalk.inspection_items SET first_uploaded_by_id = NULL WHERE id = $1',
      [legacyItem.body.id],
    );
    await upload(
      legacyTask,
      2,
      secondManagerCookie,
      'pass',
      '另一店长重传',
      0,
    ).expect(201);
    await decide(legacyTask, legacyItem.body.id, 'fail').expect(201);
    const unattributed = await request(app.getHttpServer())
      .get('/api/stats/self-check')
      .query({
        scope: 'manager',
        id: secondManagerId,
        from: '2026-10-04',
        to: '2026-10-04',
      })
      .set('Cookie', adminCookie)
      .expect(200);
    expect(unattributed.body).toEqual({
      sampleCount: 0,
      matchingCount: 0,
      accuracy: null,
    });
  });

  it('FW-030 restricts review and statistics to admins and normalizes service failures', async () => {
    now = new Date('2026-11-09T10:30:00.000Z');
    const taskId = await createTask();
    const uploaded = await upload(
      taskId,
      2,
      managerCookie,
      'pass',
      '已检查',
      0,
    ).expect(201);
    const statsPath = `/api/stats/self-check?scope=site&id=${siteId}&from=2026-11-09&to=2026-11-09`;
    for (const path of [
      '/api/review/tasks',
      `/api/tasks/${taskId}/review`,
      statsPath,
    ]) {
      const anonymous = await request(app.getHttpServer())
        .get(path)
        .expect(401);
      expect(errorResponseSchema.parse(anonymous.body).code).toBe(
        'UNAUTHENTICATED',
      );
      const denied = await request(app.getHttpServer())
        .get(path)
        .set('Cookie', managerCookie)
        .expect(403);
      expect(errorResponseSchema.parse(denied.body).code).toBe('FORBIDDEN');
    }
    for (const cookie of [undefined, managerCookie]) {
      const pending = request(app.getHttpServer())
        .post(`/api/tasks/${taskId}/items/${uploaded.body.id}/decision`)
        .send({ result: 'pass' });
      if (cookie) pending.set('Cookie', cookie);
      const denied = await pending.expect(cookie ? 403 : 401);
      expect(errorResponseSchema.parse(denied.body).code).toBe(
        cookie ? 'FORBIDDEN' : 'UNAUTHENTICATED',
      );
    }
    const validQuery = {
      scope: 'site',
      id: siteId,
      from: '2026-11-09',
      to: '2026-11-09',
    };
    for (const query of [
      {},
      { ...validQuery, scope: 'unknown' },
      { ...validQuery, id: 'not-a-uuid' },
      { ...validQuery, from: '2026-02-30' },
      { ...validQuery, to: '2026-11-08' },
    ]) {
      const invalid = await request(app.getHttpServer())
        .get('/api/stats/self-check')
        .query(query)
        .set('Cookie', adminCookie)
        .expect(400);
      expect(errorResponseSchema.parse(invalid.body).code).toBe(
        'VALIDATION_FAILED',
      );
    }
    for (const [scope, id] of [
      ['site', randomUUID()],
      ['manager', randomUUID()],
      ['manager', adminId],
    ]) {
      const missing = await request(app.getHttpServer())
        .get('/api/stats/self-check')
        .query({ ...validQuery, scope, id })
        .set('Cookie', adminCookie)
        .expect(404);
      expect(errorResponseSchema.parse(missing.body).code).toBe('NOT_FOUND');
    }
    const failed = vi
      .spyOn(app.get(TaskDecisionService), 'listReviewQueue')
      .mockRejectedValueOnce(new Error('internal fixture details'));
    try {
      const response = await request(app.getHttpServer())
        .get('/api/review/tasks')
        .set('Cookie', adminCookie)
        .expect(500);
      expect(errorResponseSchema.parse(response.body)).toEqual({
        code: 'VALIDATION_FAILED',
        message: '请求无法处理。',
      });
    } finally {
      failed.mockRestore();
    }
  });
});
