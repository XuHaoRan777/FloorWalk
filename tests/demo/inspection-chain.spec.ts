import { rm } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createPool } from '../../apps/api/src/db/client.js';

const slot = Number(process.env.FW_SLOT);
const apiUrl = `http://127.0.0.1:${3100 + slot * 10}`;
const mobileUrl = `http://127.0.0.1:${3100 + slot * 10 + 2}`;
const webUrl = `http://127.0.0.1:${3100 + slot * 10 + 1}`;
const storageDir = path.resolve(`apps/api/.e2e/slot-${slot}/storage`);
const password = 'northbean-demo';
let createdTaskId: string | undefined;
const jpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAA//Z',
  'base64',
);

function databaseUrlForSlot() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.pathname = `/floorwalk_e2e_${slot}`;
  return url.toString();
}

async function login(page: Page, loginName: string) {
  await page.goto(loginName === 'hq@northbean.example' ? webUrl : mobileUrl);
  await page.getByLabel('登录名').fill(loginName);
  await page.getByLabel('密码').fill(password);
  if (loginName === 'hq@northbean.example')
    await page.getByRole('button', { name: '登录', exact: true }).click();
  else await page.getByTestId('login-button').click();
  const response = await page.request.post(`${apiUrl}/api/auth/session`, {
    data: { loginName, password },
  });
  expect(response.status()).toBe(201);
  const headers = response.headers();
  const sessionCookie = headers['set-cookie']?.match(
    /(?:^|,\s*)fw_session=([^;,]*)/i,
  )?.[1];
  expect(sessionCookie).toBeTruthy();
  return sessionCookie!;
}

async function keepChatActive(page: Page) {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await expect
    .poll(() => page.evaluate(() => document.hasFocus() && !document.hidden))
    .toBe(true);
}

async function sendAndObservePolling(
  sender: Page,
  receiver: Page,
  inspectionId: string,
  body: string,
) {
  let sentAt = Infinity;
  const delivered = receiver.waitForResponse(
    async (response) => {
      if (
        new URL(response.url()).pathname !==
          `/api/inspections/${inspectionId}/messages` ||
        response.request().method() !== 'GET' ||
        !response.ok()
      )
        return false;
      const data = (await response.json()) as {
        messages: Array<{ body: string | null }>;
      };
      return data.messages.some((message) => message.body === body);
    },
    { timeout: 5000 },
  );
  const sent = sender
    .waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/inspections/${inspectionId}/messages` &&
        response.request().method() === 'POST',
    )
    .then(async (response) => {
      sentAt = Date.now();
      expect(response.status()).toBe(201);
      return (await response.json()) as { id: string };
    });
  const [message] = await Promise.all([
    sent,
    delivered,
    sender.getByRole('button', { name: '发送', exact: true }).click(),
  ]);
  await expect(
    receiver
      .getByRole('list', { name: '聊天消息' })
      .getByText(body, { exact: true }),
  ).toBeVisible();
  expect(Date.now() - sentAt).toBeLessThanOrEqual(5000);
  return message.id;
}

test.afterEach(async () => {
  const taskId = createdTaskId;
  createdTaskId = undefined;
  if (!taskId) return;

  const pool = createPool(databaseUrlForSlot());
  const client = await pool.connect();
  let storageKeys: string[];
  try {
    await client.query('BEGIN');
    const stored = await client.query<{ storageKey: string }>(
      `SELECT evidence.storage_key AS "storageKey"
       FROM floorwalk.evidence evidence
       JOIN floorwalk.inspection_items item ON item.id = evidence.inspection_item_id
       JOIN floorwalk.inspections inspection ON inspection.id = item.inspection_id
       WHERE inspection.task_id = $1
       UNION ALL
       SELECT message.storage_key AS "storageKey"
       FROM floorwalk.chat_messages message
       JOIN floorwalk.inspections inspection ON inspection.id = message.inspection_id
       WHERE inspection.task_id = $1 AND message.storage_key IS NOT NULL`,
      [taskId],
    );
    storageKeys = stored.rows.map((row) => row.storageKey);
    await client.query(
      `DELETE FROM floorwalk.inspection_item_decisions decision
       USING floorwalk.inspection_items item, floorwalk.inspections inspection
       WHERE decision.inspection_item_id = item.id
         AND item.inspection_id = inspection.id AND inspection.task_id = $1`,
      [taskId],
    );
    await client.query(
      'DELETE FROM floorwalk.inspection_participants WHERE inspection_id IN (SELECT id FROM floorwalk.inspections WHERE task_id = $1)',
      [taskId],
    );
    await client.query(
      'DELETE FROM floorwalk.chat_messages WHERE inspection_id IN (SELECT id FROM floorwalk.inspections WHERE task_id = $1)',
      [taskId],
    );
    await client.query(
      'DELETE FROM floorwalk.reviews WHERE inspection_id IN (SELECT id FROM floorwalk.inspections WHERE task_id = $1)',
      [taskId],
    );
    await client.query(
      `DELETE FROM floorwalk.evidence WHERE inspection_item_id IN
       (SELECT item.id FROM floorwalk.inspection_items item
        JOIN floorwalk.inspections inspection ON inspection.id = item.inspection_id
        WHERE inspection.task_id = $1)`,
      [taskId],
    );
    await client.query(
      'DELETE FROM floorwalk.inspection_items WHERE inspection_id IN (SELECT id FROM floorwalk.inspections WHERE task_id = $1)',
      [taskId],
    );
    await client.query('DELETE FROM floorwalk.inspections WHERE task_id = $1', [
      taskId,
    ]);
    await client.query('DELETE FROM floorwalk.inspection_tasks WHERE id = $1', [
      taskId,
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
  for (const storageKey of storageKeys)
    await rm(path.resolve(storageDir, storageKey), { force: true });
});

test('店长逐项上传，管理员逐条判定并改判，保留历史与聊天', async ({
  browser,
}) => {
  const pool = createPool(databaseUrlForSlot());
  const managerContext = await browser.newContext();
  const adminContext = await browser.newContext();
  let taskId: string | undefined;
  let inspectionId: string | undefined;
  const manager = await managerContext.newPage();
  const admin = await adminContext.newPage();
  try {
    const managerSession = await login(manager, 'manager2@northbean.example');
    await keepChatActive(manager);
    await expect(manager.getByRole('tab', { name: '今日待巡' })).toBeVisible();
    await expect(manager.getByText('今日任务暂不可用')).toBeVisible();
    await expect(manager.getByTestId('start-inspection')).toHaveCount(0);
    await expect(manager.getByTestId('submit-inspection')).toHaveCount(0);

    const source = await pool.query<{
      orgId: string;
      siteId: string;
      siteCode: string;
      siteName: string;
      managerId: string;
      templateId: string;
      templateName: string;
    }>(
      `SELECT site.org_id AS "orgId", site.id AS "siteId",
         site.code AS "siteCode",
         site.name AS "siteName", manager.id AS "managerId",
         template.id AS "templateId", template.name AS "templateName"
       FROM floorwalk.users manager
       JOIN floorwalk.sites site ON site.id = manager.site_id
       JOIN floorwalk.templates template ON template.org_id = manager.org_id
       WHERE manager.login_name = 'manager2@northbean.example'
         AND site.code = 'NB-001' AND site.deactivated_at IS NULL
       ORDER BY template.created_at, template.id LIMIT 1`,
    );
    expect(source.rows).toHaveLength(1);
    const data = source.rows[0];
    const templateItems = await pool.query<{
      position: number;
      title: string;
      minPhotoCount: number;
      critical: boolean;
    }>(
      `SELECT position, title, min_photo_count AS "minPhotoCount", critical
       FROM floorwalk.template_items WHERE template_id = $1 ORDER BY position`,
      [data.templateId],
    );
    expect(templateItems.rows.length).toBeGreaterThan(1);
    const firstNonCritical = templateItems.rows.find((item) => !item.critical);
    expect(firstNonCritical).toBeTruthy();

    const taskDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const startsAt = new Date(Date.now() - 5 * 60_000);
    const dueAt = new Date(Date.now() + 123 * 60_000);
    const createdTask = await pool.query<{ id: string }>(
      `INSERT INTO floorwalk.inspection_tasks
         (org_id, site_id, template_id, task_date, position, occurrence,
          starts_at, due_at)
       VALUES ($1, $2, $3, $4::date, 999, $5, $6, $7)
       RETURNING id`,
      [
        data.orgId,
        data.siteId,
        data.templateId,
        taskDate,
        Date.now() % 1_000_000_000,
        startsAt,
        dueAt,
      ],
    );
    taskId = createdTask.rows[0].id;
    createdTaskId = taskId;

    for (const item of templateItems.rows) {
      const multipart = new FormData();
      multipart.set('selfAssessment', 'pass');
      if (item.minPhotoCount === 0)
        multipart.set('note', `已完成：${item.title}`);
      for (let index = 0; index < item.minPhotoCount; index += 1)
        multipart.append(
          'files',
          new File([jpeg], `demo-${item.position}-${index + 1}.jpg`, {
            type: 'image/jpeg',
          }),
        );
      const upload = await manager.request.post(
        `${apiUrl}/api/tasks/${taskId}/items/${item.position}/uploads`,
        {
          headers: { Cookie: `fw_session=${managerSession}` },
          multipart,
        },
      );
      const uploadBody = await upload.text();
      expect(upload.status(), `upload ${item.position}: ${uploadBody}`).toBe(
        201,
      );
    }
    const inspection = await pool.query<{ id: string }>(
      'SELECT id FROM floorwalk.inspections WHERE task_id = $1',
      [taskId],
    );
    inspectionId = inspection.rows[0]?.id;
    expect(inspectionId).toBeTruthy();
    await manager.getByRole('tab', { name: '记录', exact: true }).click();
    const recordRow = manager.locator(
      `[data-testid="record-row-${inspectionId}"]`,
    );
    await expect(recordRow).toBeVisible();
    await recordRow.click();
    await expect(
      manager.getByRole('heading', { name: '巡检记录详情' }),
    ).toBeVisible();
    await expect(
      manager.getByRole('button', { name: /通过|不合格|提交巡检/ }),
    ).toHaveCount(0);
    await expect(manager.getByTestId('chat-message-list')).toBeVisible();

    const expiredTask = await pool.query<{ dueAt: Date }>(
      `UPDATE floorwalk.inspection_tasks SET due_at = now() - interval '1 second'
       WHERE id = $1 RETURNING due_at AS "dueAt"`,
      [taskId],
    );
    const dueLabel = new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(expiredTask.rows[0].dueAt);
    await login(admin, 'hq@northbean.example');
    await keepChatActive(admin);
    await expect(
      admin.getByRole('heading', { name: /总部看板/ }),
    ).toBeVisible();
    await admin
      .getByLabel('控制台导航')
      .getByRole('button', { name: '审核队列', exact: true })
      .click();
    const taskRow = admin
      .getByRole('button')
      .filter({ hasText: data.siteCode })
      .filter({ hasText: dueLabel });
    await expect(taskRow).toBeVisible();
    await taskRow.click();
    await expect(
      admin.getByRole('heading', { name: data.siteName }),
    ).toBeVisible();
    const failingItem = admin.getByRole('article').filter({
      has: admin.getByRole('heading', {
        name: new RegExp(firstNonCritical!.title),
      }),
    });
    await failingItem.getByRole('button', { name: '不合格' }).click();
    for (const item of templateItems.rows) {
      if (item.position === firstNonCritical!.position) continue;
      const card = admin.getByRole('article').filter({
        has: admin.getByRole('heading', { name: new RegExp(item.title) }),
      });
      await card.getByRole('button', { name: '通过', exact: true }).click();
    }
    const summary = admin.locator('.fw-page-heading').last();
    await expect(summary).toContainText('88 分');
    await expect(summary).toContainText('通过');
    await failingItem
      .getByRole('button', { name: '通过', exact: true })
      .click();
    await expect(summary).toContainText('100 分');
    await expect(summary).toContainText('通过');

    await admin.getByRole('button', { name: '总部看板', exact: true }).click();
    const dashboardRow = admin
      .getByRole('row')
      .filter({ hasText: data.siteCode });
    await expect(dashboardRow).toContainText('100');

    const message = '任务已复核，现场记录已留存。';
    await admin
      .getByLabel('控制台导航')
      .getByRole('button', { name: '审核队列', exact: true })
      .click();
    const completedTaskRow = admin
      .getByRole('button')
      .filter({ hasText: data.siteCode })
      .filter({ hasText: dueLabel });
    await completedTaskRow.click();
    await keepChatActive(admin);
    await keepChatActive(manager);
    await manager.getByRole('textbox', { name: '聊天内容' }).fill(message);
    await sendAndObservePolling(manager, admin, inspectionId!, message);
  } finally {
    await manager.request
      .delete(`${apiUrl}/api/auth/session`)
      .catch(() => undefined);
    await admin.request
      .delete(`${apiUrl}/api/auth/session`)
      .catch(() => undefined);
    await pool.end();
    await Promise.all([managerContext.close(), adminContext.close()]);
  }
});
