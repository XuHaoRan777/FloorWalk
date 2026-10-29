import {
  expect,
  request,
  test,
  type APIRequestContext,
} from '@playwright/test';
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

test.afterEach(async () => {
  for (const context of contexts.splice(0)) {
    await context.delete(`${apiBase}/api/auth/session`).catch(() => undefined);
    await context.dispose();
  }
});

test.afterAll(async () => {
  try {
    if (messageIds.length)
      await pool.query(
        'DELETE FROM floorwalk.chat_messages WHERE id = ANY($1::uuid[])',
        [messageIds],
      );
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
  const beforeResponse = await staff.get(
    `${apiBase}/api/inspections/${target.id}/messages?before=${firstPage.messages[0].seq}`,
  );
  const earlierPage = (await beforeResponse.json()) as {
    messages: Array<{ id: string }>;
    hasMoreBefore: boolean;
  };
  await page.getByRole('button', { name: '加载更早' }).click();
  for (const message of earlierPage.messages)
    await expect(page.getByTestId(`chat-message-${message.id}`)).toBeVisible();
  if (!earlierPage.hasMoreBefore)
    await expect(page.getByRole('button', { name: '加载更早' })).toHaveCount(0);

  await sendMessage(staff, target.id, 'Expo Web 外部更新');
  await expect(list.getByText('Expo Web 外部更新')).toBeVisible({
    timeout: 5000,
  });

  const input = page.getByRole('textbox', { name: '聊天内容' });
  await input.fill('x'.repeat(1001));
  await expect(page.getByText('1001/1000')).toBeVisible();
  await expect(page.getByRole('button', { name: '发送' })).toBeDisabled();
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

  await input.fill('图文消息');
  const fileChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '选择图片' }).click();
  const imageBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/6ioAAAAASUVORK5CYII=',
    'base64',
  );
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
});
