import { randomUUID } from 'node:crypto';
import { expect, request as playwrightRequest, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { createPool } from '../../apps/api/src/db/client.js';

const configuredSlot = Number(process.env.FW_SLOT);
const apiBase = `http://127.0.0.1:${3100 + configuredSlot * 10}/api`;
const adminPassword = 'northbean-demo';
const managerInitialPassword = 'initial-password';
const managerPassword = 'changed-password';

async function loginAdmin(page: Page) {
  await page.goto('/');
  await page.getByLabel('登录名').fill('hq@northbean.example');
  await page.getByLabel('密码').fill(adminPassword);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: /总部看板/ })).toBeVisible();
}

test('FW-028 AC-10 逐条上传、打回重传、判定与改判', async ({ page }) => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  databaseUrl.pathname = `/floorwalk_e2e_${configuredSlot}`;
  const pool = createPool(databaseUrl.toString());
  let managerContext: APIRequestContext | undefined;
  let siteId: string | undefined;
  let templateId: string | undefined;
  let managerId: string | undefined;
  let scheduleId: string | undefined;
  let taskId: string | undefined;

  try {
    await loginAdmin(page);
    const suffix = randomUUID();
    const siteResponse = await page.request.post(`${apiBase}/admin/sites`, {
      data: {
        code: `FW028-${suffix}`,
        name: `FW-028 测试门店 ${suffix.slice(0, 8)}`,
      },
    });
    expect(siteResponse.status()).toBe(201);
    const site = (await siteResponse.json()) as { id: string; name: string };
    siteId = site.id;

    const templateResponse = await page.request.post(
      `${apiBase}/admin/templates`,
      {
        data: {
          name: `FW-028 测试模板 ${suffix}`,
          aiEnabled: false,
          items: [
            {
              title: '检查项一',
              minPhotoCount: 0,
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
      },
    );
    expect(templateResponse.status()).toBe(201);
    templateId = ((await templateResponse.json()) as { id: string }).id;

    const userResponse = await page.request.post(`${apiBase}/admin/users`, {
      data: {
        loginName: `fw028-${suffix}@example.test`,
        displayName: 'FW-028 测试店长',
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
    const scheduleResponse = await page.request.post(
      `${apiBase}/admin/schedules`,
      { data: { name: `FW-028 测试日程 ${suffix}`, days } },
    );
    expect(scheduleResponse.status()).toBe(201);
    scheduleId = ((await scheduleResponse.json()) as { id: string }).id;
    const assignmentResponse = await page.request.put(
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
        loginName: `fw028-${suffix}@example.test`,
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
        { multipart: { selfAssessment: 'pass', note } },
      );

    expect((await upload(1, '首轮现场检查。')).status()).toBe(201);
    expect((await upload(2, '记录另一项检查结果。')).status()).toBe(201);

    await page
      .getByLabel('控制台导航')
      .getByRole('button', { name: '审核队列', exact: true })
      .click();
    const taskRow = page.getByRole('button').filter({ hasText: site.name });
    await expect(taskRow).toBeVisible();
    await taskRow.click();
    await expect(page.getByRole('heading', { name: site.name })).toBeVisible();

    const firstItem = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: /检查项一/ }) });
    await expect(firstItem).toContainText('FW-028 测试店长');
    await expect(firstItem).toContainText(/上传于 \d{2}:\d{2}/);
    const firstItemId = (
      await pool.query<{ id: string }>(
        `SELECT item.id FROM floorwalk.inspection_items item
       JOIN floorwalk.inspections inspection ON inspection.id = item.inspection_id
       WHERE inspection.task_id = $1 AND item.position = 1`,
        [taskId],
      )
    ).rows[0].id;
    const firstRework = page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(`/api/tasks/${taskId}/items/${firstItemId}/decision`) &&
        response.request().method() === 'POST',
    );
    await firstItem.getByRole('button', { name: '打回' }).click();
    expect((await firstRework).status()).toBe(201);
    await expect(firstItem).toContainText('打回');

    expect((await upload(1, '按要求补充现场说明。')).status()).toBe(201);
    await page.getByRole('button', { name: '刷新任务' }).click();
    await expect(firstItem).toContainText('FW-028 测试店长');
    await firstItem.getByRole('button', { name: '通过' }).click();
    const secondItem = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: /检查项二/ }) });
    await pool.query(
      `UPDATE floorwalk.inspection_tasks
       SET due_at = now() - interval '2 hours' WHERE id = $1`,
      [taskId],
    );
    await secondItem.getByRole('button', { name: '不合格' }).click();
    const summary = page.locator('.fw-page-heading').last();
    await expect(summary).toContainText('50 分');
    await expect(summary).toContainText('不合格');
    await expect(
      firstItem.getByRole('button', { name: '打回' }),
    ).toBeDisabled();

    await secondItem.getByRole('button', { name: '通过' }).click();
    await expect(summary).toContainText('100 分');
    await expect(summary).toContainText('通过');
  } finally {
    if (managerContext) {
      await managerContext
        .delete(`${apiBase}/auth/session`)
        .catch(() => undefined);
      await managerContext.dispose();
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (taskId) {
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
      if (siteId)
        await client.query(
          'DELETE FROM floorwalk.site_schedules WHERE site_id = $1',
          [siteId],
        );
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
    await page.request.delete(`${apiBase}/auth/session`).catch(() => undefined);
  }
});
