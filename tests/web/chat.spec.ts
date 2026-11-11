import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import path from 'node:path';
import type { TaskReview } from '@libs/shared';
import { rm } from 'node:fs/promises';
import { createPool } from '../../apps/api/src/db/client.js';

const slot = Number(process.env.FW_SLOT);
const apiBase = `http://127.0.0.1:${3100 + slot * 10}`;
const demoPassword = 'northbean-demo';
const pool = createPool(databaseUrlForSlot());
const createdMessageIds: string[] = [];
let adminContext: APIRequestContext | undefined;
let staffContext: APIRequestContext | undefined;

function databaseUrlForSlot() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.pathname = `/floorwalk_e2e_${slot}`;
  return url.toString();
}

async function login(
  context: APIRequestContext,
  loginName: string,
): Promise<void> {
  const response = await context.post(`${apiBase}/api/auth/session`, {
    data: { loginName, password: demoPassword },
  });
  expect(response.status()).toBe(201);
}

async function sendApiMessage(
  context: APIRequestContext,
  inspectionId: string,
  text: string,
) {
  const response = await context.post(
    `${apiBase}/api/inspections/${inspectionId}/messages`,
    { multipart: { text } },
  );
  expect(response.status()).toBe(201);
  const message = (await response.json()) as { id: string };
  createdMessageIds.push(message.id);
  return message;
}

async function visibility(page: Page, visible: boolean) {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: value ? 'visible' : 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, visible);
}

test.afterAll(async () => {
  try {
    if (createdMessageIds.length) {
      const stored = await pool.query<{ storage_key: string | null }>(
        'DELETE FROM floorwalk.chat_messages WHERE id = ANY($1::uuid[]) RETURNING storage_key',
        [createdMessageIds],
      );
      for (const row of stored.rows)
        if (row.storage_key)
          await rm(
            path.resolve(
              process.env.STORAGE_DIR ?? `apps/api/.e2e/slot-${slot}/storage`,
              row.storage_key,
            ),
            { force: true },
          );
    }
  } finally {
    await pool.end();
  }
});

test.afterEach(async () => {
  for (const context of [staffContext, adminContext]) {
    if (!context) continue;
    await context.delete(`${apiBase}/api/auth/session`).catch(() => undefined);
    await context.dispose();
  }
  staffContext = undefined;
  adminContext = undefined;
});

test('chat history, polling, visibility and HQ read-only', async ({ page }) => {
  adminContext = await request.newContext();
  staffContext = await request.newContext();
  await login(adminContext, 'hq@northbean.example');
  const queueResponse = await adminContext.get(`${apiBase}/api/review/tasks`);
  expect(queueResponse.ok()).toBeTruthy();
  const queue = (await queueResponse.json()) as TaskReview[];
  const task = queue.find(
    (entry) => entry.status === 'submitted' && entry.inspectionId,
  );
  const target = task && { ...task, id: task.inspectionId! };
  expect(target).toBeTruthy();
  if (!target) return;

  const staffLoginName =
    target.site.code === 'NB-001'
      ? 'inspector@northbean.example'
      : `inspector+${target.site.code.toLowerCase()}@northbean.example`;
  await login(staffContext, staffLoginName);
  for (let index = 0; index < 51; index += 1)
    await sendApiMessage(
      staffContext,
      target.id,
      `分页消息 ${String(index + 1).padStart(2, '0')}`,
    );
  const latestResponse = await staffContext.get(
    `${apiBase}/api/inspections/${target.id}/messages`,
  );
  const latestPage = (await latestResponse.json()) as {
    messages: Array<{ id: string; seq: string }>;
    hasMoreBefore: boolean;
  };
  expect(latestPage.messages).toHaveLength(50);
  expect(latestPage.hasMoreBefore).toBe(true);

  await page.goto('/');
  await page.getByLabel('登录名').fill('hq@northbean.example');
  await page.getByLabel('密码').fill(demoPassword);
  await page.getByRole('button', { name: '登录' }).click();
  await page
    .getByLabel('控制台导航')
    .getByRole('button', { name: '审核队列', exact: true })
    .click();
  await page
    .getByRole('button')
    .filter({ hasText: target.site.name })
    .filter({ hasText: target.taskDate })
    .first()
    .click();
  const messageList = page.getByRole('list', { name: '聊天消息' });
  await expect(messageList.locator('li')).toHaveCount(50);
  const renderedIds = await messageList
    .locator('li')
    .evaluateAll((items) =>
      items.map((item) => item.getAttribute('data-message-id')),
    );
  expect(renderedIds).toEqual(latestPage.messages.map((message) => message.id));
  await expect(page.getByRole('button', { name: '加载更早' })).toBeVisible();
  await page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      response.url().includes(`/inspections/${target.id}/messages?after=`),
  );

  const beforeResponse = await staffContext.get(
    `${apiBase}/api/inspections/${target.id}/messages?before=${latestPage.messages[0].seq}`,
  );
  const beforePage = (await beforeResponse.json()) as {
    messages: Array<{ id: string }>;
    hasMoreBefore: boolean;
  };
  await page.getByRole('button', { name: '加载更早' }).click();
  await expect(messageList.locator('li')).toHaveCount(
    50 + beforePage.messages.length,
  );
  const allRenderedIds = await messageList
    .locator('li')
    .evaluateAll((items) =>
      items.map((item) => item.getAttribute('data-message-id')),
    );
  expect(allRenderedIds).toEqual([
    ...beforePage.messages.map((message) => message.id),
    ...latestPage.messages.map((message) => message.id),
  ]);
  if (!beforePage.hasMoreBefore)
    await expect(page.getByRole('button', { name: '加载更早' })).toHaveCount(0);

  await expect(page.getByRole('textbox', { name: '聊天内容' })).toHaveCount(0);
  await expect(page.getByLabel('选择聊天图片')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '发送' })).toHaveCount(0);
  const deniedWrite = await adminContext.post(
    `${apiBase}/api/inspections/${target.id}/messages`,
    { multipart: { text: '管理员不可发送' } },
  );
  expect(deniedWrite.status()).toBe(403);

  let pollCount = 0;
  page.on('request', (browserRequest) => {
    const url = new URL(browserRequest.url());
    if (
      browserRequest.method() === 'GET' &&
      url.pathname.endsWith(`/inspections/${target.id}/messages`) &&
      url.searchParams.has('after')
    )
      pollCount += 1;
  });
  await expect.poll(() => pollCount, { timeout: 5000 }).toBeGreaterThan(0);
  await visibility(page, false);
  await page.waitForTimeout(400);
  const hiddenPollCount = pollCount;
  const hiddenMessage = await sendApiMessage(
    staffContext,
    target.id,
    '后台期间店长发出的消息',
  );
  await page.waitForTimeout(2200);
  expect(pollCount).toBe(hiddenPollCount);
  await visibility(page, true);
  await expect(
    messageList.locator(`[data-message-id="${hiddenMessage.id}"]`),
  ).toBeVisible({ timeout: 2000 });
});
