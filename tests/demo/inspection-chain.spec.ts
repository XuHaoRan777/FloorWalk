import { rm } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createPool } from '../../apps/api/src/db/client.js';

const slot = Number(process.env.FW_SLOT);
const apiUrl = `http://127.0.0.1:${3100 + slot * 10}`;
const mobileUrl = `http://127.0.0.1:${3100 + slot * 10 + 2}`;
const webUrl = `http://127.0.0.1:${3100 + slot * 10 + 1}`;
const storageDir = path.resolve(`apps/api/.e2e/slot-${slot}/storage`);
const password = 'northbean-demo';
let createdInspectionId: string | undefined;

function databaseUrlForSlot() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.pathname = `/floorwalk_e2e_${slot}`;
  return url.toString();
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
  observe: (deadline: number, messageId: string) => Promise<void>,
) {
  let sentAt = Infinity;
  // Both documents remain active; no focus/visibility event can supply a refill.
  const receiverEvents: string[] = [];
  const recordEvent = () => receiverEvents.push('focus-or-visibility');
  await receiver.exposeFunction('recordChatFocusEvent', recordEvent);
  await receiver.evaluate(() => {
    const record = () =>
      (
        window as unknown as { recordChatFocusEvent: () => void }
      ).recordChatFocusEvent();
    window.addEventListener('focus', record);
    window.addEventListener('blur', record);
    document.addEventListener('visibilitychange', record);
  });
  const delivered = receiver.waitForResponse(
    async (response) => {
      if (
        new URL(response.url()).pathname !==
          `/api/inspections/${inspectionId}/messages` ||
        response.request().method() !== 'GET' ||
        response.request().timing().startTime < sentAt ||
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
      return (await response.json()) as { id: string; imageUrl: string };
    });
  const [message] = await Promise.all([
    sent,
    delivered,
    sender.getByRole('button', { name: '发送', exact: true }).click(),
  ]);
  await observe(sentAt + 5000, message.id);
  expect(Date.now() - sentAt).toBeLessThanOrEqual(5000);
  expect(receiverEvents).toEqual([]);
  expect(
    await receiver.evaluate(() => document.hasFocus() && !document.hidden),
  ).toBe(true);
  console.log(`chat polling delivery: ${Date.now() - sentAt}ms`);
  return message;
}

test.afterEach(async () => {
  const inspectionId = createdInspectionId;
  createdInspectionId = undefined;
  if (!inspectionId) return;

  const pool = createPool(databaseUrlForSlot());
  const client = await pool.connect();
  let storageKeys: string[];
  try {
    await client.query('BEGIN');
    const stored = await client.query<{ storage_key: string }>(
      `SELECT evidence.storage_key
         FROM floorwalk.evidence
         JOIN floorwalk.inspection_items
           ON inspection_items.id = evidence.inspection_item_id
        WHERE inspection_items.inspection_id = $1
       UNION ALL
       SELECT storage_key FROM floorwalk.chat_messages
        WHERE inspection_id = $1 AND storage_key IS NOT NULL`,
      [inspectionId],
    );
    storageKeys = stored.rows.map((row) => row.storage_key);
    await client.query(
      'DELETE FROM floorwalk.chat_messages WHERE inspection_id = $1',
      [inspectionId],
    );
    await client.query(
      'DELETE FROM floorwalk.reviews WHERE inspection_id = $1',
      [inspectionId],
    );
    await client.query(
      `DELETE FROM floorwalk.evidence
        WHERE inspection_item_id IN (
          SELECT id FROM floorwalk.inspection_items WHERE inspection_id = $1
        )`,
      [inspectionId],
    );
    await client.query(
      'DELETE FROM floorwalk.inspection_items WHERE inspection_id = $1',
      [inspectionId],
    );
    await client.query('DELETE FROM floorwalk.inspections WHERE id = $1', [
      inspectionId,
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

test('店员、主管与总部通过真实界面完成 NB-001 巡检闭环', async ({
  browser,
}) => {
  const inspectorContext = await browser.newContext();
  let supervisorContext: BrowserContext | undefined;
  let hqContext: BrowserContext | undefined;
  let inspector: Page | undefined;
  let hq: Page | undefined;
  let siteId: string | undefined;
  let siteDisabled = false;
  try {
    inspector = await inspectorContext.newPage();
    const page = inspector;
    await keepChatActive(page);
    await page.goto(mobileUrl);
    await page.getByLabel('邮箱').fill('inspector@northbean.example');
    await page.getByLabel('密码').fill(password);
    await page.getByTestId('login-button').click();
    await expect(page.getByRole('tab', { name: '今日待巡' })).toBeVisible();
    const inspectionResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith('/api/inspections') &&
        response.request().method() === 'POST',
    );
    await page.getByTestId('start-inspection').click();
    const inspectionResponse = await inspectionResponsePromise;
    expect(inspectionResponse.status()).toBe(201);
    const inspectionId = ((await inspectionResponse.json()) as { id: string })
      .id;
    createdInspectionId = inspectionId;
    await expect(page.getByRole('heading', { name: '巡检详情' })).toBeVisible();

    const itemCards = page.locator('[data-testid^="inspection-item-"]');
    await expect(itemCards).toHaveCount(8);
    let coldItem = page.locator('[data-testid="inspection-item-1"]');
    for (let index = 0; index < 8; index += 1) {
      const card = page.locator(`[data-testid="inspection-item-${index + 1}"]`);
      const title = (await card.innerText()).split('\n')[0] ?? '';
      if (title.includes('冷柜')) {
        coldItem = card;
        await card.getByRole('button', { name: '不合格', exact: true }).click();
      } else {
        await card.getByRole('button', { name: '合格', exact: true }).click();
      }
      if (await card.getByRole('button', { name: '选择照片' }).count()) {
        const chooserPromise = page.waitForEvent('filechooser');
        await card.getByRole('button', { name: '选择照片' }).click();
        const chooser = await chooserPromise;
        await chooser.setFiles({
          name: `nb001-${index + 1}.jpg`,
          mimeType: 'image/jpeg',
          buffer: Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2w==', 'base64'),
        });
        await expect(
          card.getByRole('button', { name: '已上传 1 张照片' }),
        ).toBeVisible();
      }
    }
    await expect(coldItem.getByText('当前结果：不合格')).toBeVisible();
    const [firstSubmit] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/inspections/') &&
          response.url().endsWith('/submit') &&
          response.request().method() === 'POST',
      ),
      page.getByTestId('submit-inspection').click(),
    ]);
    expect(firstSubmit.status()).toBe(201);
    expect((await firstSubmit.json()).score).toBe(88);
    await expect(page.getByText('已提交：submitted，分数 88')).toBeVisible();

    supervisorContext = await browser.newContext();
    const supervisor = await supervisorContext.newPage();
    await keepChatActive(supervisor);
    await supervisor.goto(webUrl);
    await supervisor.getByLabel('邮箱').fill('supervisor@northbean.example');
    await supervisor.getByLabel('密码').fill(password);
    await supervisor.getByRole('button', { name: '登录' }).click();
    await expect(
      supervisor.getByRole('heading', { name: /审核队列/ }),
    ).toBeVisible();
    const firstReview = supervisor
      .getByRole('button')
      .filter({ hasText: 'NB-001' })
      .filter({ hasText: 'Northbean Coffee 1' });
    await expect(firstReview).toBeVisible();
    await expect(firstReview).toContainText('88');
    await firstReview.click();
    const coldReviewItem = supervisor
      .locator('article')
      .filter({ hasText: '冷柜温度' });
    await supervisor.getByRole('button', { name: '打回', exact: true }).click();
    await coldReviewItem.getByLabel('选择为打回项').check();
    await supervisor.getByRole('button', { name: '确认打回' }).click();
    await expect(supervisor.getByText('已打回', { exact: true })).toBeVisible();
    await page.getByLabel('返回今日待巡').click();
    const reworkCard = page.getByText('状态：待补交').last();
    await expect(reworkCard).toBeVisible();
    const initialChatResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === `/api/inspections/${inspectionId}/messages` &&
        !url.search &&
        response.request().method() === 'GET'
      );
    });
    await reworkCard.click();
    expect((await initialChatResponse).status()).toBe(200);
    await expect(page.getByText('主管打回')).toBeVisible();
    await expect(page.getByText('需要补充或修改')).toBeVisible();
    const inspectorChat = page.getByTestId('chat-message-list');
    const supervisorReason = '请补充冷柜温度照片后重新提交。';
    await supervisor
      .getByRole('textbox', { name: '聊天内容' })
      .fill(supervisorReason);
    await sendAndObservePolling(
      supervisor,
      page,
      inspectionId,
      supervisorReason,
      async (deadline) => {
        await expect(
          inspectorChat.getByText(supervisorReason, { exact: true }),
        ).toBeVisible({ timeout: Math.max(1, deadline - Date.now()) });
      },
    );
    const reply = '已补拍冷柜温度照片，请复核。';
    await page.getByRole('textbox', { name: '聊天内容' }).fill(reply);
    const imageBytes = Buffer.from(
      await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        return canvas.toDataURL('image/png').split(',')[1];
      }),
      'base64',
    );
    const imageChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '选择图片' }).click();
    await (
      await imageChooserPromise
    ).setFiles({
      name: 'chat-reply.png',
      mimeType: 'image/png',
      buffer: imageBytes,
    });
    const inspectorReplyMessageBody = await sendAndObservePolling(
      page,
      supervisor,
      inspectionId,
      reply,
      async (deadline, messageId) => {
        await expect(
          supervisor
            .getByRole('list', { name: '聊天消息' })
            .getByText(reply, { exact: true }),
        ).toBeVisible({ timeout: Math.max(1, deadline - Date.now()) });
        await expect
          .poll(
            () =>
              supervisor
                .locator(`[data-message-id="${messageId}"] img`)
                .evaluate((image) => (image as HTMLImageElement).naturalWidth),
            { timeout: Math.max(1, deadline - Date.now()) },
          )
          .toBeGreaterThan(0);
      },
    );
    expect(new URL(inspectorReplyMessageBody.imageUrl).pathname).toContain(
      '/storage/',
    );
    const inspectorReplyMessage = inspectorChat
      .locator('[data-testid^="chat-message-"]')
      .filter({ hasText: reply });
    await expect(inspectorReplyMessage).toBeVisible();
    const replyImage = inspectorReplyMessage.getByLabel('聊天图片');
    await expect(replyImage).toBeVisible();
    await expect
      .poll(() =>
        inspectorReplyMessage
          .locator('img')
          .evaluateAll((images) =>
            images.some((image) => image.complete && image.naturalWidth > 0),
          ),
      )
      .toBe(true);
    coldItem = page.locator('[data-testid="inspection-item-3"]');
    await coldItem.getByRole('button', { name: '合格', exact: true }).click();
    const replacementChooserPromise = page.waitForEvent('filechooser');
    await coldItem.getByRole('button', { name: '已上传 1 张照片' }).click();
    const replacementChooser = await replacementChooserPromise;
    await replacementChooser.setFiles({
      name: 'nb001-cold-fridge-recheck.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2w==', 'base64'),
    });
    await page.getByTestId('submit-inspection').click();
    await expect(page.getByText('已提交：submitted，分数 100')).toBeVisible();

    await supervisor.getByRole('button', { name: '返回队列' }).click();
    const secondReview = supervisor
      .getByRole('button')
      .filter({ hasText: 'NB-001' })
      .filter({ hasText: 'Northbean Coffee 1' });
    await expect(secondReview).toContainText('100');
    await secondReview.click();
    await supervisor.getByRole('button', { name: '通过', exact: true }).click();
    await expect(supervisor.getByText('已通过', { exact: true })).toBeVisible();

    const reviewQueueResponse = await supervisor.request.get(
      `${apiUrl}/api/review/queue`,
    );
    const reviewQueue = (await reviewQueueResponse.json()) as Array<{
      status: string;
      site: { code: string };
    }>;
    expect(
      reviewQueue.filter(
        (entry) =>
          entry.site.code === 'NB-001' &&
          ['submitted', 'in_review'].includes(entry.status),
      ),
    ).toHaveLength(0);

    hqContext = await browser.newContext();
    hq = await hqContext.newPage();
    await hq.goto(webUrl);
    await hq.getByLabel('邮箱').fill('hq@northbean.example');
    await hq.getByLabel('密码').fill(password);
    await hq.getByRole('button', { name: '登录' }).click();
    await expect(hq.getByRole('heading', { name: /总部看板/ })).toBeVisible();
    const nb001 = hq
      .getByRole('row')
      .filter({ has: hq.getByText('Northbean Coffee 1', { exact: true }) });
    await expect(nb001).toContainText('NB-001');
    await expect(nb001).toContainText('100');
    const dashboardResponse = await hq.request.get(
      `${apiUrl}/api/dashboard/sites`,
    );
    const dashboard = (await dashboardResponse.json()) as Array<{
      site: { id: string; code: string };
    }>;
    siteId = dashboard.find((entry) => entry.site.code === 'NB-001')?.site.id;
    expect(siteId).toBeTruthy();

    await hq.getByRole('button', { name: '门店', exact: true }).click();
    const siteRow = hq.getByRole('row').filter({ hasText: 'NB-001' });
    hq.once('dialog', (dialog) => dialog.accept());
    await siteRow.getByRole('button', { name: '停用', exact: true }).click();
    siteDisabled = true;
    await expect(siteRow).toContainText('已停用');
    await hq.getByRole('button', { name: '总部看板', exact: true }).click();
    const disabledDashboardRow = hq
      .getByRole('row')
      .filter({ hasText: 'NB-001' });
    await expect(disabledDashboardRow).toContainText('已停用');

    await hq.getByRole('button', { name: '门店', exact: true }).click();
    const reenabled = hq.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/admin/sites/${siteId}` &&
        response.request().method() === 'PATCH',
    );
    await hq
      .getByRole('row')
      .filter({ hasText: 'NB-001' })
      .getByRole('button', { name: '重新启用', exact: true })
      .click();
    const reenabledResponse = await reenabled;
    expect(reenabledResponse.ok()).toBe(true);
    expect((await reenabledResponse.json()).active).toBe(true);
    await expect(
      hq
        .getByRole('row')
        .filter({ hasText: 'NB-001' })
        .getByRole('cell')
        .nth(2),
    ).toHaveText('启用');
    siteDisabled = false;

    await page.getByLabel('返回今日待巡').click();
    await page.getByRole('tab', { name: '记录', exact: true }).click();
    const recordRows = page.locator('[data-testid^="record-row-"]');
    await expect(recordRows.first()).toHaveAttribute(
      'data-testid',
      `record-row-${inspectionId}`,
    );
    await recordRows.first().click();
    await expect(
      page.getByRole('heading', { name: '巡检记录详情' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /合格|不合格|提交巡检/ }),
    ).toHaveCount(0);
    const recordChat = page.getByTestId('chat-message-list');
    await expect(
      recordChat.getByText(supervisorReason, { exact: true }),
    ).toBeVisible();
    await expect(recordChat.getByText(reply, { exact: true })).toBeVisible();
    await expect(
      recordChat
        .locator('[data-testid^="chat-message-"]')
        .filter({ hasText: reply })
        .getByLabel('聊天图片'),
    ).toBeVisible();
  } finally {
    try {
      if (siteDisabled && siteId && hq) {
        const restored = await hq.request.patch(
          `${apiUrl}/api/admin/sites/${siteId}`,
          { data: { active: true } },
        );
        expect(restored.ok()).toBe(true);
        expect((await restored.json()).active).toBe(true);
      }
    } finally {
      await Promise.all(
        [inspectorContext, supervisorContext, hqContext]
          .filter((context): context is BrowserContext => Boolean(context))
          .map((context) => context.close()),
      );
    }
  }
});
