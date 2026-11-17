import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { expect, request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { createPool } from '../../apps/api/src/db/client.js';
import { seedPhoto } from '../../apps/api/src/db/seed-data.js';
import { LocalStorageDriver } from '../../apps/api/src/storage/local.js';

const managerInitialPassword = 'initial-password';
const managerPassword = 'changed-password';

export async function createReviewFixture(
  admin: APIRequestContext,
  apiBase: string,
) {
  const configuredSlot = Number(process.env.FW_SLOT);
  if (
    !Number.isInteger(configuredSlot) ||
    configuredSlot < 1 ||
    configuredSlot > 3
  ) {
    throw new Error('FW_SLOT 必须是 1、2 或 3。');
  }
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  if (decodeURIComponent(databaseUrl.username) !== 'floorwalk') {
    throw new Error('测试数据库必须使用 floorwalk 角色。');
  }
  databaseUrl.pathname = `/floorwalk_e2e_${configuredSlot}`;
  const pool = createPool(databaseUrl.toString());
  let managerContext: APIRequestContext | undefined;
  let siteId: string | undefined;
  let templateId: string | undefined;
  let standardId: string | undefined;
  let managerId: string | undefined;
  let scheduleId: string | undefined;
  let taskId: string | undefined;

  async function cleanup() {
    if (managerContext) {
      await managerContext
        .delete(`${apiBase}/auth/session`)
        .catch(() => undefined);
      await managerContext.dispose();
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (siteId) {
        await client.query(
          'SELECT id FROM floorwalk.sites WHERE id = $1 FOR UPDATE',
          [siteId],
        );
        await client.query(
          'DELETE FROM floorwalk.site_schedules WHERE site_id = $1',
          [siteId],
        );
        await client.query(
          `DELETE FROM floorwalk.inspection_tasks task
           WHERE task.site_id = $1 AND NOT EXISTS (
             SELECT 1 FROM floorwalk.inspections inspection WHERE inspection.task_id = task.id
           )`,
          [siteId],
        );
      }
      if (taskId) {
        await client.query(
          `DELETE FROM floorwalk.notifications
           WHERE payload_json->>'taskId' = $1`,
          [taskId],
        );
        const evidence = await client.query<{ storageKey: string }>(
          `SELECT evidence.storage_key AS "storageKey" FROM floorwalk.evidence evidence
           JOIN floorwalk.inspection_items item ON item.id = evidence.inspection_item_id
           JOIN floorwalk.inspections inspection ON inspection.id = item.inspection_id
           WHERE inspection.task_id = $1`,
          [taskId],
        );
        const storage = new LocalStorageDriver(
          path.resolve(`apps/api/.e2e/slot-${configuredSlot}/storage`),
        );
        for (const row of evidence.rows) await storage.delete(row.storageKey);
        await client.query(
          `DELETE FROM floorwalk.evidence evidence
           USING floorwalk.inspection_items item, floorwalk.inspections inspection
           WHERE evidence.inspection_item_id = item.id
             AND item.inspection_id = inspection.id AND inspection.task_id = $1`,
          [taskId],
        );
        await client.query(
          `DELETE FROM floorwalk.ai_review_jobs job
           USING floorwalk.inspection_items item, floorwalk.inspections inspection
           WHERE job.inspection_item_id = item.id
             AND item.inspection_id = inspection.id AND inspection.task_id = $1`,
          [taskId],
        );
        await client.query(
          `DELETE FROM floorwalk.inspection_item_decisions decision
           USING floorwalk.inspection_items item, floorwalk.inspections inspection
           WHERE decision.inspection_item_id = item.id
             AND item.inspection_id = inspection.id AND inspection.task_id = $1`,
          [taskId],
        );
        await client.query(
          `DELETE FROM floorwalk.inspection_participants participant
           USING floorwalk.inspections inspection
           WHERE participant.inspection_id = inspection.id AND inspection.task_id = $1`,
          [taskId],
        );
        await client.query(
          `DELETE FROM floorwalk.inspection_items item
           USING floorwalk.inspections inspection
           WHERE item.inspection_id = inspection.id AND inspection.task_id = $1`,
          [taskId],
        );
        await client.query(
          'DELETE FROM floorwalk.inspections WHERE task_id = $1',
          [taskId],
        );
        await client.query(
          'DELETE FROM floorwalk.inspection_tasks WHERE id = $1',
          [taskId],
        );
      }
      if (scheduleId)
        await client.query('DELETE FROM floorwalk.schedules WHERE id = $1', [
          scheduleId,
        ]);
      if (managerId)
        await client.query(
          'DELETE FROM floorwalk.sessions WHERE user_id = $1',
          [managerId],
        );
      if (managerId)
        await client.query('DELETE FROM floorwalk.users WHERE id = $1', [
          managerId,
        ]);
      if (templateId) {
        await client.query(
          'DELETE FROM floorwalk.template_items WHERE template_id = $1',
          [templateId],
        );
        await client.query('DELETE FROM floorwalk.templates WHERE id = $1', [
          templateId,
        ]);
      }
      if (standardId)
        await client.query(
          'DELETE FROM floorwalk.ai_review_standards WHERE id = $1',
          [standardId],
        );
      if (siteId)
        await client.query('DELETE FROM floorwalk.sites WHERE id = $1', [
          siteId,
        ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }

  try {
    const suffix = randomUUID();
    const siteResponse = await admin.post(`${apiBase}/admin/sites`, {
      data: {
        code: `FW034-${suffix}`,
        name: `FW-034 测试门店 ${suffix.slice(0, 8)}`,
      },
    });
    expect(siteResponse.status()).toBe(201);
    const site = (await siteResponse.json()) as { id: string; name: string };
    siteId = site.id;

    const standardResponse = await admin.post(`${apiBase}/admin/ai-standards`, {
      data: {
        name: `FW-034 失败模型标准 ${suffix}`,
        prompt: 'FW-031 fake model failure',
      },
    });
    expect(standardResponse.status()).toBe(201);
    standardId = ((await standardResponse.json()) as { id: string }).id;

    const templateResponse = await admin.post(`${apiBase}/admin/templates`, {
      data: {
        name: `FW-034 测试模板 ${suffix}`,
        aiEnabled: true,
        aiStandardId: standardId,
        items: [
          {
            title: '检查项一',
            minPhotoCount: 1,
            acceptanceCriteria: '确认现场情况。',
            critical: false,
          },
          {
            title: '检查项二',
            minPhotoCount: 0,
            acceptanceCriteria: '确认记录准确。',
            critical: false,
          },
        ],
      },
    });
    expect(templateResponse.status()).toBe(201);
    templateId = ((await templateResponse.json()) as { id: string }).id;

    const userResponse = await admin.post(`${apiBase}/admin/users`, {
      data: {
        loginName: `fw034-${suffix}@example.test`,
        displayName: 'FW-034 测试店长',
        role: 'store_manager',
        siteId,
        password: managerInitialPassword,
      },
    });
    expect(userResponse.status()).toBe(201);
    managerId = ((await userResponse.json()) as { id: string }).id;

    const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekday =
      weekdayNames.indexOf(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Shanghai',
          weekday: 'short',
        }).format(new Date()),
      ) + 1;
    const taskDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const days = Array.from({ length: 7 }, (_, index) => ({
      weekday: index + 1,
      enabled: index + 1 === weekday,
      tasks:
        index + 1 === weekday
          ? [{ templateId, startsAt: '00:00', endsAt: '23:59' }]
          : [],
    }));
    const scheduleResponse = await admin.post(`${apiBase}/admin/schedules`, {
      data: { name: `FW-034 测试日程 ${suffix}`, days },
    });
    expect(scheduleResponse.status()).toBe(201);
    scheduleId = ((await scheduleResponse.json()) as { id: string }).id;
    const assignmentResponse = await admin.put(
      `${apiBase}/admin/site-schedules`,
      { data: { siteIds: [siteId], scheduleId } },
    );
    expect(assignmentResponse.status()).toBe(200);

    const task = await pool.query<{ id: string }>(
      `SELECT id FROM floorwalk.inspection_tasks
       WHERE site_id = $1 AND template_id = $2 AND task_date = $3::date
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [siteId, templateId, taskDate],
    );
    taskId = task.rows[0]?.id;
    expect(taskId).toBeTruthy();
    if (!taskId) throw new Error('当天日程没有生成巡检任务。');

    managerContext = await playwrightRequest.newContext();
    const loginResponse = await managerContext.post(`${apiBase}/auth/session`, {
      data: {
        loginName: `fw034-${suffix}@example.test`,
        password: managerInitialPassword,
      },
    });
    expect(loginResponse.status()).toBe(201);
    const passwordChange = await managerContext.post(`${apiBase}/me/password`, {
      data: {
        currentPassword: managerInitialPassword,
        newPassword: managerPassword,
      },
    });
    expect(passwordChange.status()).toBe(204);
    const upload = async (position: number, note: string) =>
      managerContext!.post(
        `${apiBase}/tasks/${taskId}/items/${position}/uploads`,
        {
          multipart: {
            selfAssessment: 'pass',
            note,
            ...(position === 1
              ? {
                  files: {
                    name: '现场.jpg',
                    mimeType: 'image/jpeg',
                    buffer: seedPhoto,
                  },
                }
              : {}),
          },
        },
      );

    const resolvedTaskId = taskId;
    return {
      taskId: resolvedTaskId,
      managerLoginName: `fw034-${suffix}@example.test`,
      managerPassword,
      site,
      pool,
      upload,
      async waitForManual() {
        await expect
          .poll(
            async () => {
              const jobs = await pool.query(
                `SELECT job.status, job.attempt_count AS attempts
             FROM floorwalk.ai_review_jobs job
             JOIN floorwalk.inspection_items item ON item.id = job.inspection_item_id
             JOIN floorwalk.inspections inspection ON inspection.id = item.inspection_id
             WHERE inspection.task_id = $1 AND job.upload_version = item.upload_version
             ORDER BY item.position`,
                [resolvedTaskId],
              );
              return jobs.rows;
            },
            { timeout: 20_000 },
          )
          .toEqual([
            { status: 'manual', attempts: 4 },
            { status: 'manual', attempts: 4 },
          ]);
      },
      async expireWindow() {
        await pool.query(
          `UPDATE floorwalk.inspection_tasks SET starts_at = now() - interval '3 hours',
           due_at = now() - interval '1 hour' WHERE id = $1`,
          [resolvedTaskId],
        );
      },
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
