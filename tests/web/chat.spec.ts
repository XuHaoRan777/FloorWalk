import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Page,
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
  await page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      response.url().includes(`/inspections/${target.id}/messages?after=`),
  );
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
  if (!beforePage.hasMoreBefore)
    await expect(page.getByRole('button', { name: '加载更早' })).toHaveCount(0);
  await textbox.fill('x'.repeat(1001));
  await expect(page.getByText('1001/1000')).toBeVisible();
  await expect(page.getByRole('button', { name: '发送' })).toBeDisabled();
  await visibility(page, false);
  const interleaved = await sendApiMessage(
    staffContext,
    target.id,
    '发送前尚未轮询的对方消息',
  );
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
  await visibility(page, true);
  await expect(
    messageList.locator(`[data-message-id="${interleaved.id}"]`),
  ).toBeVisible({ timeout: 5000 });

  await visibility(page, false);
  const messagesUrl = (url: URL) =>
    url.pathname.endsWith(`/inspections/${target.id}/messages`);
  for (const [status, message] of [
    [403, '当前账号没有权限执行此操作。'],
    [409, '当前巡检单状态已变化，请刷新后重试。'],
    [422, '提交内容不完整，请检查后重试。'],
  ] as const) {
    await page.route(messagesUrl, async (route) => {
      if (route.request().method() === 'POST')
        await route.fulfill({ status, json: {} });
      else await route.continue();
    });
    await textbox.fill(`失败后保留 ${status}`);
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(
      page.getByRole('region', { name: '巡检聊天' }).getByRole('alert'),
    ).toHaveText(message);
    await expect(textbox).toHaveValue(`失败后保留 ${status}`);
    await page.unroute(messagesUrl);
  }
  let releaseSend!: () => void;
  const sendGate = new Promise<void>((resolve) => {
    releaseSend = resolve;
  });
  await page.route(messagesUrl, async (route) => {
    if (route.request().method() === 'POST') await sendGate;
    await route.continue();
  });
  const retryResponse = page.waitForResponse(
    (response) =>
      messagesUrl(new URL(response.url())) &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '发送', exact: true }),
  ).toBeDisabled();
  releaseSend();
  const retried = await retryResponse;
  expect(retried.status()).toBe(201);
  createdMessageIds.push(((await retried.json()) as { id: string }).id);
  await expect(textbox).toHaveValue('');
  await page.unroute(messagesUrl);

  let offlinePolls = 0;
  await page.route(messagesUrl, async (route) => {
    if (route.request().method() === 'GET') offlinePolls += 1;
    await route.abort();
  });
  await page.evaluate(() => {
    const state = { appearances: 0, present: false };
    (window as unknown as { chatErrorState: typeof state }).chatErrorState =
      state;
    new MutationObserver(() => {
      const present =
        document.body.textContent?.includes(
          '网络连接失败，请检查网络后重试。',
        ) ?? false;
      if (present && !state.present) state.appearances += 1;
      state.present = present;
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  await visibility(page, true);
  await expect(
    page.getByRole('region', { name: '巡检聊天' }).getByRole('alert'),
  ).toHaveText('网络连接失败，请检查网络后重试。');
  await expect.poll(() => offlinePolls).toBeGreaterThanOrEqual(3);
  await expect(
    page.getByRole('region', { name: '巡检聊天' }).getByRole('alert'),
  ).toHaveCount(1);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { chatErrorState: { appearances: number } })
          .chatErrorState.appearances,
    ),
  ).toBe(1);
  await textbox.fill('断网发送保留');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(textbox).toHaveValue('断网发送保留');
  await page.unroute(messagesUrl);
  const recovered = await sendApiMessage(
    staffContext,
    target.id,
    '网络恢复自动补拉',
  );
  await expect(
    messageList.locator(`[data-message-id="${recovered.id}"]`),
  ).toBeVisible({ timeout: 5000 });
  await expect(
    page.getByRole('region', { name: '巡检聊天' }).getByRole('alert'),
  ).toHaveCount(0);
  await textbox.fill('');

  await visibility(page, false);
  let invalidPosts = 0;
  const countInvalidPosts = (
    browserRequest: import('@playwright/test').Request,
  ) => {
    if (
      browserRequest.method() === 'POST' &&
      messagesUrl(new URL(browserRequest.url()))
    )
      invalidPosts += 1;
  };
  page.on('request', countInvalidPosts);
  for (const candidate of [
    {
      name: 'invalid.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('invalid'),
      error: '仅支持 JPEG 或 PNG 图片。',
    },
    {
      name: 'too-large.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
      error: '图片不能超过 10MB。',
    },
  ]) {
    await page.getByLabel('选择聊天图片').setInputFiles(candidate);
    await expect(
      page.getByRole('region', { name: '巡检聊天' }).getByRole('alert'),
    ).toHaveText(candidate.error);
    await expect(
      page.getByRole('button', { name: '发送', exact: true }),
    ).toBeDisabled();
  }
  expect(invalidPosts).toBe(0);
  page.off('request', countInvalidPosts);
  const imageBytes = Buffer.from(
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
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: '{"message":"照片链接无效或已过期。"}',
      });
    } else {
      const url = new URL(route.request().url());
      // Temporary slot workaround until FW-015 sets API_PUBLIC_BASE_URL in the web test config.
      await route.continue({
        url: `${apiBase}${url.pathname}${url.search}`,
      });
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
  await visibility(page, true);

  await page.getByRole('button', { name: '退出登录' }).click();
  await page.getByLabel('邮箱').fill('hq@northbean.example');
  await page.getByLabel('密码').fill(demoPassword);
  await page.getByRole('button', { name: '登录' }).click();
  await page.locator('#main').getByRole('button', { name: '审核队列' }).click();
  await page.getByText(target.site.name, { exact: true }).click();
  await expect(page.getByRole('heading', { name: '巡检聊天' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '聊天内容' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '发送' })).toHaveCount(0);
  const authDialog = page.waitForEvent('dialog');
  await page.route(messagesUrl, (route) =>
    route.fulfill({
      status: 401,
      json: { code: 'UNAUTHENTICATED', message: '登录凭证无效，请重新登录。' },
    }),
  );
  const dialog = await authDialog;
  expect(dialog.message()).toBe('登录凭证无效，请重新登录。');
  await dialog.accept();
  await expect(
    page.getByRole('button', { name: '登录', exact: true }),
  ).toBeVisible({ timeout: 5000 });
  await page.unroute(messagesUrl);
});
