import { expect, test, type Page } from '@playwright/test';

const loginName = 'manager2@northbean.example';
const password = 'northbean-demo';
const apiBase = `http://127.0.0.1:${3100 + Number(process.env.FW_SLOT) * 10}/api`;

async function readToday(page: Page) {
  return page.evaluate(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/inspector/today`, {
      credentials: 'include',
    });
    return response.json();
  }, apiBase) as Promise<{
    site: { name: string };
    submittedToday: boolean;
    templates: Array<{
      id: string;
      name: string;
      items: Array<{
        position: number;
        title: string;
        minPhotoCount: number;
      }>;
    }>;
    reworkInspections: Array<{ id: string }>;
  }>;
}

test('店长登录、重启保持登录、查看我的并退出', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '开始巡检' })).toBeVisible();
  await page.getByLabel('登录名').fill(loginName);
  await page.getByLabel('密码').fill(password);
  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/auth/session') &&
      response.request().method() === 'POST',
  );
  await page.getByTestId('login-button').click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(201);
  const cookieHeader = await loginResponse.headerValue('set-cookie');
  const sessionId = cookieHeader?.match(/(?:^|,\s*)fw_session=([^;]*)/)?.[1];
  const sessionCookieIsHttpOnly = Boolean(
    sessionId && /(?:^|;\s*)HttpOnly(?:;|$)/i.test(cookieHeader ?? ''),
  );
  expect(sessionCookieIsHttpOnly).toBe(true);
  if (!sessionId) throw new Error('Login response did not set fw_session');

  await expect(
    page.getByRole('tab', { name: '今日待巡', exact: true }),
  ).toBeVisible();
  const storageContainsSessionId = await page.evaluate((id) => {
    const storages = [localStorage, sessionStorage];
    return storages.some((storage) =>
      Array.from({ length: storage.length }, (_, index) =>
        storage.getItem(storage.key(index) ?? ''),
      ).some((value) => value?.includes(id)),
    );
  }, sessionId);
  expect(storageContainsSessionId).toBe(false);
  const documentContainsSessionCookie = await page.evaluate(() =>
    document.cookie.includes('fw_session'),
  );
  expect(documentContainsSessionCookie).toBe(false);

  const today = await readToday(page);
  const template = today.templates[0];
  expect(template).toBeDefined();
  await expect(
    page.getByRole('heading', { name: today.site.name }),
  ).toBeVisible();
  await expect(page.getByText(template.name, { exact: true })).toBeVisible();
  await expect(
    page.getByText(today.submittedToday ? '今天已提交' : '今天尚未提交'),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('heading', { name: today.site.name }),
  ).toBeVisible();
  await page.getByLabel('我的').click();
  await expect(page.getByText(loginName, { exact: true })).toBeVisible();
  await expect(
    page.getByLabel('当前门店').filter({ hasText: today.site.name }),
  ).toBeVisible();
  const logoutResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/auth/session') &&
      response.request().method() === 'DELETE',
  );
  await page.getByRole('button', { name: '退出登录' }).click();
  const logoutResponse = await logoutResponsePromise;
  expect(logoutResponse.status()).toBe(204);
  await expect(page.getByRole('heading', { name: '开始巡检' })).toBeVisible();
  const meResponse = await page.context().request.get(`${apiBase}/me`);
  expect(meResponse.status()).toBe(401);
});

test('错误密码显示中文错误提示', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('登录名').fill(loginName);
  await page.getByLabel('密码').fill('wrong-password');
  await page.getByTestId('login-button').click();
  await expect(page.getByText('登录名或密码错误。')).toBeVisible();
});

test('连不上 API 时显示网络错误，并在控制台打印原始错误', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (message) => {
    logs.push(message.text());
  });
  await page.route('**/api/auth/session', (route) => route.abort());
  await page.goto('/');
  await page.getByLabel('登录名').fill(loginName);
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await expect(
    page.getByText('网络连接失败，请检查网络后重试。'),
  ).toBeVisible();
  expect(logs.some((line) => line.includes('[FloorWalk API] fetch 异常'))).toBe(
    true,
  );
});

test('今日任务来自接口，照片不足或 0 张项备注空白时阻止提交', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('登录名').fill(loginName);
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await page.getByTestId('start-inspection').click();
  await expect(page.getByRole('heading', { name: '巡检详情' })).toBeVisible();
  const today = await readToday(page);
  const template = today.templates[0];
  expect(template).toBeDefined();

  for (const [index, item] of template.items.entries()) {
    const card = page.getByTestId(`inspection-item-${item.position}`);
    await card.getByRole('button', { name: '合格', exact: true }).click();
    await expect(page.getByText('当前结果：合格')).toHaveCount(index + 1);
    if (item.minPhotoCount === 0) {
      await expect(card.getByPlaceholder('填写现场备注（必填）')).toBeVisible();
      await card.getByLabel(`${item.title}备注`).fill('   ');
      await expect(card.getByRole('button', { name: /选择照片/ })).toHaveCount(
        0,
      );
    } else {
      await expect(
        card.getByText(`最少 ${item.minPhotoCount} 张照片`, { exact: true }),
      ).toBeVisible();
    }
  }
  await page.getByTestId('submit-inspection').click();
  const missingTitles = template.items.map((item) => item.title).join('、');
  await expect(page.getByText(`请完成：${missingTitles}`)).toBeVisible();
});

test('按最少张数逐项选图，填写 0 张项备注并提交巡检', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('登录名').fill(loginName);
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await page.getByTestId('start-inspection').click();
  const today = await readToday(page);
  const template = today.templates[0];
  expect(template).toBeDefined();
  const imageBytes = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      return canvas.toDataURL('image/jpeg').split(',')[1];
    }),
    'base64',
  );
  for (const [index, item] of template.items.entries()) {
    const card = page.getByTestId(`inspection-item-${item.position}`);
    await card.getByRole('button', { name: '合格', exact: true }).click();
    await expect(page.getByText('当前结果：合格')).toHaveCount(index + 1);
    if (item.minPhotoCount === 0) {
      await card.getByLabel(`${item.title}备注`).fill('现场已检查，符合要求。');
      continue;
    }
    for (let photoIndex = 0; photoIndex < item.minPhotoCount; photoIndex += 1) {
      const chooserPromise = page.waitForEvent('filechooser');
      await card
        .getByRole('button', {
          name: photoIndex === 0 ? '选择照片' : '继续选择照片',
          exact: true,
        })
        .click();
      const chooser = await chooserPromise;
      await chooser.setFiles({
        name: `inspection-${item.position}-${photoIndex + 1}.jpg`,
        mimeType: 'image/jpeg',
        buffer: imageBytes,
      });
      await expect(
        card.getByText(
          `已上传 ${photoIndex + 1} 张照片 · 最少 ${item.minPhotoCount} 张`,
          { exact: true },
        ),
      ).toBeVisible();
    }
  }
  await page.getByTestId('submit-inspection').click();
  await expect(page.getByText(/已提交：submitted/)).toBeVisible();
});

test('NB-002 打回单显示主管意见并可重新提交', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('登录名').fill('inspector+nb-002@northbean.example');
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await expect(page.getByRole('tab', { name: '今日待巡' })).toBeVisible();
  const today = await readToday(page);
  await expect(page.getByText('Northbean Coffee 2')).toBeVisible();
  await expect(page.getByText('状态：待补交')).toHaveCount(
    today.reworkInspections.length,
  );
  await page.getByText('状态：待补交').click();
  await expect(page.getByText('主管打回')).toBeVisible();
  await expect(page.getByText('需要补充或修改')).toBeVisible();
  await page.getByRole('button', { name: '提交巡检' }).click();
  await expect(page.getByText(/已提交：/)).toBeVisible();
});

test('首次启动时删除旧的本地 token 并显示登录页', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('floorwalk.auth.token', 'invalid-token'),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '开始巡检' })).toBeVisible();
  const legacyTokenWasRemoved = await page.evaluate(
    () => localStorage.getItem('floorwalk.auth.token') === null,
  );
  expect(legacyTokenWasRemoved).toBe(true);
});

test('FW-008 AC-03 未登录直接访问受保护和未知地址回登录，且没有底部栏', async ({
  page,
}) => {
  for (const url of [
    '/today',
    '/profile',
    '/inspection/00000000-0000-0000-0000-000000000000',
    '/unknown/path',
  ]) {
    await page.goto(url);
    await expect(page.getByRole('heading', { name: '开始巡检' })).toBeVisible();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('tab')).toHaveCount(0);
  }
});

test('FW-008 AC-03 Tabs 与详情切换会更新 URL，详情返回今日待巡', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('登录名').fill(loginName);
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await expect(page).toHaveURL('/today');
  await expect(page.getByRole('tab')).toHaveCount(3);
  await expect(page.getByRole('tab', { name: '记录' })).toBeVisible();
  await page.getByLabel('我的').click();
  await expect(page).toHaveURL('/profile');
  await page.getByLabel('今日待巡', { exact: true }).click();
  await expect(page).toHaveURL('/today');
  await page.getByTestId('start-inspection').click();
  await expect(page).toHaveURL(/\/inspection\/[0-9a-f-]+$/);
  await expect(page.getByRole('tab')).toHaveCount(0);
  await page.getByLabel('返回今日待巡').click();
  await expect(page).toHaveURL('/today');
  await expect(page.getByRole('tab')).toHaveCount(3);
});
