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
const password = 'northbean-demo';
const contexts: APIRequestContext[] = [];
const messageIds: string[] = [];
const pool = createPool(databaseUrlForSlot());

function databaseUrlForSlot() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.pathname = `/floorwalk_e2e_${slot}`;
  return url.toString();
}

async function signedInContext(email: string) {
  const context = await request.newContext();
  contexts.push(context);
  const response = await context.post(`${apiBase}/api/auth/session`, {
    data: { email, password },
  });
  expect(response.status()).toBe(201);
  return context;
}

async function sendMessage(
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
  messageIds.push(message.id);
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

test.afterEach(async () => {
  for (const context of contexts.splice(0)) {
    await context.delete(`${apiBase}/api/auth/session`).catch(() => undefined);
    await context.dispose();
  }
});

test.afterAll(async () => {
  try {
    if (messageIds.length) {
      const stored = await pool.query<{ storage_key: string | null }>(
        'DELETE FROM floorwalk.chat_messages WHERE id = ANY($1::uuid[]) RETURNING storage_key',
        [messageIds],
      );
      for (const row of stored.rows) {
        if (row.storage_key)
          await rm(
            path.resolve(
              process.env.STORAGE_DIR ?? `apps/api/.e2e/slot-${slot}/storage`,
              row.storage_key,
            ),
            { force: true },
          );
      }
    }
  } finally {
    await pool.end();
  }
});

test('Expo Web chat pagination, polling, sending, validation and HQ read-only', async ({
  page,
}) => {
  const supervisor = await signedInContext('supervisor@northbean.example');
  const staffEmail = 'inspector+nb-002@northbean.example';
  const staff = await signedInContext(staffEmail);
  const todayResponse = await staff.get(`${apiBase}/api/inspector/today`);
  const today = (await todayResponse.json()) as {
    reworkInspections: Array<{ id: string }>;
  };
  const targetInspectionId = today.reworkInspections[0]?.id;
  expect(targetInspectionId).toBeTruthy();
  if (!targetInspectionId) return;
  const target = { id: targetInspectionId };
  for (let index = 0; index < 51; index += 1)
    await sendMessage(staff, target.id, `Mobile 分页消息 ${index + 1}`);
  const pageResponse = await staff.get(
    `${apiBase}/api/inspections/${target.id}/messages`,
  );
  const firstPage = (await pageResponse.json()) as {
    messages: Array<{ id: string; seq: string }>;
    hasMoreBefore: boolean;
  };
  expect(firstPage.messages).toHaveLength(50);
  expect(firstPage.hasMoreBefore).toBe(true);

  await page.goto('/');
  await page.getByLabel('邮箱').fill(staffEmail);
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await expect(page.getByRole('tab', { name: '今日待巡' })).toBeVisible();
  await page
    .getByText(/待补交/)
    .first()
    .click();
  await expect(page.getByRole('heading', { name: '巡检详情' })).toBeVisible();
  const list = page.getByTestId('chat-message-list');
  await expect(
    list.getByText('Mobile 分页消息 2', { exact: true }),
  ).toBeVisible();
  await expect(
    list.getByText('Mobile 分页消息 51', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('店员', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '加载更早' })).toBeVisible();
  let polls = 0;
  page.on('request', (browserRequest) => {
    if (
      browserRequest.method() === 'GET' &&
      browserRequest.url().includes(`/inspections/${target.id}/messages?after=`)
    )
      polls += 1;
  });
  await expect.poll(() => polls, { timeout: 5000 }).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: '加载更早' })).toBeVisible();
  const beforeResponse = await staff.get(
    `${apiBase}/api/inspections/${target.id}/messages?before=${firstPage.messages[0].seq}`,
  );
  const earlierPage = (await beforeResponse.json()) as {
    messages: Array<{ id: string }>;
    hasMoreBefore: boolean;
  };
  await list.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll'));
  });
  const firstVisible = page.getByTestId(
    `chat-message-${firstPage.messages[0].id}`,
  );
  const anchorBefore = await firstVisible.evaluate(
    (element) =>
      element.getBoundingClientRect().top -
      element.parentElement!.parentElement!.getBoundingClientRect().top,
  );
  await page.getByRole('button', { name: '加载更早' }).click();
  for (const message of earlierPage.messages)
    await expect(page.getByTestId(`chat-message-${message.id}`)).toBeVisible();
  if (!earlierPage.hasMoreBefore)
    await expect(page.getByRole('button', { name: '加载更早' })).toHaveCount(0);
  await expect
    .poll(() =>
      firstVisible.evaluate(
        (element) =>
          element.getBoundingClientRect().top -
          element.parentElement!.parentElement!.getBoundingClientRect().top,
      ),
    )
    .toBeCloseTo(anchorBefore, 0);

  await sendMessage(supervisor, target.id, 'Expo Web 外部更新');
  await expect(list.getByText('Expo Web 外部更新')).toBeVisible({
    timeout: 5000,
  });
  if (!earlierPage.hasMoreBefore)
    await expect(page.getByRole('button', { name: '加载更早' })).toHaveCount(0);
  await visibility(page, false);
  await page.waitForTimeout(300);
  const hiddenPolls = polls;
  await page.waitForTimeout(4200);
  expect(polls).toBe(hiddenPolls);
  await visibility(page, true);
  await expect
    .poll(() => polls, { timeout: 1500 })
    .toBeGreaterThan(hiddenPolls);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hasFocus', {
      configurable: true,
      value: () => false,
    });
    window.dispatchEvent(new Event('blur'));
  });
  await page.waitForTimeout(300);
  const unfocusedPolls = polls;
  await page.waitForTimeout(4200);
  expect(polls).toBe(unfocusedPolls);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hasFocus', {
      configurable: true,
      value: () => true,
    });
    window.dispatchEvent(new Event('focus'));
  });
  await expect
    .poll(() => polls, { timeout: 1500 })
    .toBeGreaterThan(unfocusedPolls);

  const input = page.getByRole('textbox', { name: '聊天内容' });
  await input.fill('x'.repeat(1001));
  await expect(page.getByText('1001/1000')).toBeVisible();
  await expect(page.getByRole('button', { name: '发送' })).toBeDisabled();
  await visibility(page, false);
  const interleaved = await sendMessage(
    supervisor,
    target.id,
    '本端发送前的主管消息',
  );
  await input.fill('Mobile Web 消息');
  const sentResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/inspections/${target.id}/messages`) &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '发送' }).click();
  const sent = await sentResponse;
  expect(sent.status()).toBe(201);
  const sentMessage = (await sent.json()) as { id: string };
  messageIds.push(sentMessage.id);
  await expect(list.getByText('Mobile Web 消息')).toBeVisible();
  await expect(input).toHaveValue('');
  await visibility(page, true);
  await expect(page.getByTestId(`chat-message-${interleaved.id}`)).toBeVisible({
    timeout: 5000,
  });

  await visibility(page, false);
  const messagesUrl = (url: URL) =>
    url.pathname.endsWith(`/inspections/${target.id}/messages`);
  for (const [status, message] of [
    [401, '登录已失效，请重新登录。'],
    [403, '当前账号没有权限执行此操作。'],
    [409, '当前巡检状态不允许此操作。'],
    [422, '请先完成所有检查项和必拍照片。'],
  ] as const) {
    await page.route(messagesUrl, async (route) => {
      if (route.request().method() === 'POST')
        await route.fulfill({ status, json: {} });
      else await route.continue();
    });
    await input.fill(`失败后保留 ${status}`);
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(input).toHaveValue(`失败后保留 ${status}`);
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
  const retry = await retryResponse;
  expect(retry.status()).toBe(201);
  messageIds.push(((await retry.json()) as { id: string }).id);
  await expect(input).toHaveValue('');
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
    page.getByText('网络连接失败，请检查网络后重试。', { exact: true }),
  ).toBeVisible();
  await expect.poll(() => offlinePolls).toBeGreaterThanOrEqual(3);
  await expect(
    page.getByText('网络连接失败，请检查网络后重试。', { exact: true }),
  ).toHaveCount(1);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { chatErrorState: { appearances: number } })
          .chatErrorState.appearances,
    ),
  ).toBe(1);
  await input.fill('断网发送保留');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(input).toHaveValue('断网发送保留');
  await page.unroute(messagesUrl);
  const recovered = await sendMessage(
    supervisor,
    target.id,
    'Mobile 网络恢复补拉',
  );
  await expect(page.getByTestId(`chat-message-${recovered.id}`)).toBeVisible({
    timeout: 5000,
  });
  await expect(
    page.getByText('网络连接失败，请检查网络后重试。', { exact: true }),
  ).toHaveCount(0);
  await input.fill('');
  await visibility(page, false);

  const imageBytes = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      return canvas.toDataURL('image/png').split(',')[1];
    }),
    'base64',
  );
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
      name: 'invalid.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64',
      ),
      error: '仅支持 JPEG 或 PNG 图片。',
    },
    {
      name: 'too-large.png',
      mimeType: 'image/png',
      buffer: Buffer.concat([imageBytes, Buffer.alloc(10 * 1024 * 1024 + 1)]),
      error: '图片不能超过 10MB。',
    },
  ]) {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '选择图片' }).click();
    await (await chooser).setFiles(candidate);
    await expect(
      page.getByText(candidate.error, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '发送', exact: true }),
    ).toBeDisabled();
  }
  expect(invalidPosts).toBe(0);
  page.off('request', countInvalidPosts);
  let expiredImageRequests = 0;
  let successfulImageRequests = 0;
  let signatureRequests = 0;
  const imageUrl = (url: URL) =>
    decodeURIComponent(url.pathname).includes(`/chat/${target.id}/`);
  await page.route(imageUrl, async (route) => {
    // RN Web loads through ImageLoader, a hidden img and a CSS background.
    // Fail the expired source until the one signature refresh, not one internal request.
    if (signatureRequests === 0) {
      expiredImageRequests += 1;
      await route.fulfill({ status: 403, body: 'expired' });
    } else {
      successfulImageRequests += 1;
      await route.continue();
    }
  });
  page.on('request', (browserRequest) => {
    if (browserRequest.url().includes('/image-url')) signatureRequests += 1;
  });
  await input.fill('图文消息');
  const fileChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '选择图片' }).click();
  await (
    await fileChooser
  ).setFiles({
    name: 'chat.png',
    mimeType: 'image/png',
    buffer: imageBytes,
  });
  await expect(page.getByText('chat.png')).toBeVisible();
  const imageSentResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/inspections/${target.id}/messages`) &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '发送' }).click();
  const imageSent = await imageSentResponse;
  expect(imageSent.status()).toBe(201);
  const imageMessage = (await imageSent.json()) as {
    id: string;
    imageUrl: string;
  };
  messageIds.push(imageMessage.id);
  await expect(
    page.getByTestId(`chat-message-${imageMessage.id}`).getByLabel('聊天图片'),
  ).toBeVisible();
  expect(new URL(imageMessage.imageUrl).pathname).toContain('/storage/');
  const displayedImage = page
    .getByTestId(`chat-message-${imageMessage.id}`)
    .locator('img');
  await expect
    .poll(() =>
      displayedImage.evaluate(
        (image) => (image as HTMLImageElement).naturalWidth,
      ),
    )
    .toBeGreaterThan(0);
  expect(expiredImageRequests).toBeGreaterThan(0);
  expect(successfulImageRequests).toBeGreaterThan(0);
  expect(signatureRequests).toBe(1);
  await page.unroute(imageUrl);
  await visibility(page, true);
});
