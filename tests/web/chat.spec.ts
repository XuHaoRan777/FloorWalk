import {
  expect,
  request,
  test,
  type APIRequestContext,
} from '@playwright/test';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { createPool } from '../../apps/api/src/db/client.js';

const slot = Number(process.env.FW_SLOT);
const apiBase = `http://127.0.0.1:${3100 + slot * 10}`;
const demoPassword = 'northbean-demo';
const pool = createPool(databaseUrlForSlot());
const createdMessageIds: string[] = [];
const createdStorageKeys: string[] = [];
let supervisorContext: APIRequestContext | undefined;
let staffContext: APIRequestContext | undefined;

function databaseUrlForSlot() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.pathname = `/floorwalk_e2e_${slot}`;
  return url.toString();
}

async function login(context: APIRequestContext, email: string): Promise<void> {
  const response = await context.post(`${apiBase}/api/auth/session`, {
    data: { email, password: demoPassword },
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

test.afterAll(async () => {
  try {
    if (createdMessageIds.length) {
      const stored = await pool.query<{ storage_key: string | null }>(
        'DELETE FROM floorwalk.chat_messages WHERE id = ANY($1::uuid[]) RETURNING storage_key',
        [createdMessageIds],
      );
      for (const row of stored.rows)
        if (row.storage_key) createdStorageKeys.push(row.storage_key);
    }
    for (const storageKey of createdStorageKeys)
      await rm(
        path.resolve(
          process.env.STORAGE_DIR ?? `apps/api/.e2e/slot-${slot}/storage`,
          storageKey,
        ),
        { force: true },
      );
  } finally {
    await pool.end();
  }
});

test.afterEach(async () => {
  for (const context of [staffContext, supervisorContext]) {
    if (!context) continue;
    await context.delete(`${apiBase}/api/auth/session`).catch(() => undefined);
    await context.dispose();
  }
  staffContext = undefined;
  supervisorContext = undefined;
});

test('chat history, polling, visibility, sending, images, and HQ read-only', async ({
  page,
}) => {
  supervisorContext = await request.newContext();
  staffContext = await request.newContext();
  const supervisorEmail = 'supervisor@northbean.example';
  await login(supervisorContext, supervisorEmail);
  const queueResponse = await supervisorContext.get(
    `${apiBase}/api/review/queue`,
  );
  expect(queueResponse.ok()).toBeTruthy();
  const queue = (await queueResponse.json()) as Array<{
    id: string;
    status: string;
    site: { name: string; code: string };
  }>;
  const target = queue.find((entry) => entry.status === 'submitted');
  expect(target).toBeTruthy();
  if (!target) return;

  const staffEmail =
    target.site.code === 'NB-001'
      ? 'inspector@northbean.example'
      : `inspector+${target.site.code.toLowerCase()}@northbean.example`;
  await login(staffContext, staffEmail);
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
  await page.getByLabel('邮箱').fill(supervisorEmail);
  await page.getByLabel('密码').fill(demoPassword);
  await page.getByRole('button', { name: '登录' }).click();
  await page.getByText(target.site.name, { exact: true }).click();
  const messageList = page.getByRole('list', { name: '聊天消息' });
  await expect(messageList.locator('li')).toHaveCount(50);
  const renderedIds = await messageList
    .locator('li')
    .evaluateAll((items) =>
      items.map((item) => item.getAttribute('data-message-id')),
    );
  expect(renderedIds).toEqual(latestPage.messages.map((message) => message.id));
  await expect(page.getByRole('button', { name: '加载更早' })).toBeVisible();

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

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(400);
  const hiddenPollCount = pollCount;
  await page.waitForTimeout(4200);
  expect(pollCount).toBe(hiddenPollCount);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect
    .poll(() => pollCount, { timeout: 1500 })
    .toBeGreaterThan(hiddenPollCount);

  const external = await sendApiMessage(
    staffContext,
    target.id,
    '另一账号发出的新消息',
  );
  await expect(
    messageList.locator(`[data-message-id="${external.id}"]`),
  ).toBeVisible({
    timeout: 5000,
  });

  const textbox = page.getByRole('textbox', { name: '聊天内容' });
  await textbox.fill('x'.repeat(1001));
  await expect(page.getByText('1001/1000')).toBeVisible();
  await expect(page.getByRole('button', { name: '发送' })).toBeDisabled();
  await textbox.fill('Web 消息');
  const sentResponse = page.waitForResponse(
    (candidate) =>
      candidate.url().includes(`/api/inspections/${target.id}/messages`) &&
      candidate.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '发送' }).click();
  const sent = await sentResponse;
  expect(sent.status()).toBe(201);
  const sentMessage = (await sent.json()) as { id: string };
  createdMessageIds.push(sentMessage.id);
  await expect(
    messageList.locator(`[data-message-id="${sentMessage.id}"]`),
  ).toBeVisible();
  await expect(textbox).toHaveValue('');

  let imageBytes = Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9oADAMBAAIAAwAAABAf/9k=',
    'base64',
  );
  imageBytes = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      return canvas.toDataURL('image/png').split(',')[1];
    }),
    'base64',
  );
  let failedImage = false;
  let refreshedImageUrlStatus = 0;
  let refreshedImageRequests = 0;
  let chatImageResponseStatus = 0;
  page.on('response', (response) => {
    if (
      response.url().includes('/api/messages/') &&
      response.url().endsWith('/image-url')
    )
      refreshedImageUrlStatus = response.status();
    if (
      decodeURIComponent(new URL(response.url()).pathname).includes(
        `/storage/chat/${target.id}/`,
      )
    )
      chatImageResponseStatus = response.status();
  });
  page.on('request', (browserRequest) => {
    if (browserRequest.url().includes(`/storage/chat%2F${target.id}%2F`))
      refreshedImageRequests += 1;
  });
  const chatImageUrl = (url: URL) =>
    decodeURIComponent(url.pathname).includes(`/chat/${target.id}/`);
  await page.route(chatImageUrl, async (route) => {
    if (!failedImage) {
      failedImage = true;
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await page.getByLabel('选择聊天图片').setInputFiles({
    name: 'chat.png',
    mimeType: 'image/png',
    buffer: imageBytes,
  });
  const imageResponse = page.waitForResponse(
    (candidate) =>
      candidate.url().includes(`/api/inspections/${target.id}/messages`) &&
      candidate.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '发送' }).click();
  const imageSent = await imageResponse;
  expect(imageSent.status()).toBe(201);
  const imageMessage = (await imageSent.json()) as {
    id: string;
    imageUrl: string;
  };
  createdMessageIds.push(imageMessage.id);
  const imagePath = decodeURIComponent(
    new URL(imageMessage.imageUrl).pathname.replace('/storage/', ''),
  );
  createdStorageKeys.push(imagePath);
  const chatImage = messageList.locator(
    `[data-message-id="${imageMessage.id}"] img`,
  );
  await expect(chatImage).toBeVisible();
  await expect.poll(() => failedImage).toBe(true);
  await expect.poll(() => refreshedImageUrlStatus).toBe(200);
  await expect.poll(() => refreshedImageRequests).toBeGreaterThan(1);
  await expect
    .poll(() =>
      chatImage.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  expect(chatImageResponseStatus).toBe(200);
  await page.unroute(chatImageUrl);

  await page.getByRole('button', { name: '退出登录' }).click();
  await page.getByLabel('邮箱').fill('hq@northbean.example');
  await page.getByLabel('密码').fill(demoPassword);
  await page.getByRole('button', { name: '登录' }).click();
  await page.getByRole('button', { name: '审核队列' }).click();
  await page.getByText(target.site.name, { exact: true }).click();
  await expect(page.getByRole('heading', { name: '巡检聊天' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '聊天内容' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '发送' })).toHaveCount(0);
});
