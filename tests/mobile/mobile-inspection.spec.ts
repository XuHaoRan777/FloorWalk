import { expect, test } from '@playwright/test';

const email = 'inspector@northbean.example';
const password = 'northbean-demo';
const apiBase = `http://127.0.0.1:${3100 + Number(process.env.FW_SLOT) * 10}/api`;

async function readToday(page: import('@playwright/test').Page) {
  return page.evaluate(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/inspector/today`, {
      credentials: 'include',
    });
    return response.json();
  }, apiBase) as Promise<{
    site: { name: string };
    submittedToday: boolean;
    template: {
      name: string;
      items: Array<{ title: string; photoRequired: boolean }>;
    };
    reworkInspections: Array<{ id: string }>;
  }>;
}

test('店员登录、重启保持登录、查看我的并退出', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '开始巡检' })).toBeVisible();
  await page.getByLabel('邮箱').fill(email);
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

  await expect(page.getByText('今日待巡')).toBeVisible();
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
  await expect(
    page.getByRole('heading', { name: today.site.name }),
  ).toBeVisible();
  await expect(page.getByText(today.template.name)).toBeVisible();
  await expect(
    page.getByText(today.submittedToday ? '今天已提交' : '今天尚未提交'),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('heading', { name: today.site.name }),
  ).toBeVisible();
  await page.getByLabel('我的').click();
  await expect(page.getByText(email)).toBeVisible();
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
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill('wrong-password');
  await page.getByTestId('login-button').click();
  await expect(page.getByText('邮箱或密码错误。')).toBeVisible();
});

test('连不上 API 时显示网络错误，并在控制台打印原始错误', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (message) => {
    logs.push(message.text());
  });
  await page.route('**/api/auth/session', (route) => route.abort());
  await page.goto('/');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await expect(
    page.getByText('网络连接失败，请检查网络后重试。'),
  ).toBeVisible();
  expect(logs.some((line) => line.includes('[FloorWalk API] fetch 异常'))).toBe(
    true,
  );
});

test('今日任务来自接口，未完成必拍项时阻止提交', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await page.getByTestId('start-inspection').click();
  await expect(page.getByRole('heading', { name: '巡检详情' })).toBeVisible();
  const today = await readToday(page);

  for (let index = 0; index < today.template.items.length; index += 1) {
    await page
      .getByTestId(`inspection-item-${index + 1}`)
      .getByRole('button', { name: '合格', exact: true })
      .click();
    await expect(page.getByText('当前结果：合格')).toHaveCount(index + 1);
  }
  await page.getByTestId('submit-inspection').click();
  const missingTitles = today.template.items
    .filter((item) => item.photoRequired)
    .map((item) => item.title)
    .join('、');
  await expect(page.getByText(`请完成：${missingTitles}`)).toBeVisible();
});

test('必拍项可以选择照片并随巡检提交', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await page.getByTestId('start-inspection').click();
  const today = await readToday(page);
  for (let index = 0; index < today.template.items.length; index += 1) {
    await page
      .getByTestId(`inspection-item-${index + 1}`)
      .getByRole('button', { name: '合格', exact: true })
      .click();
    await expect(page.getByText('当前结果：合格')).toHaveCount(index + 1);
  }
  const requiredItems = page.getByRole('button', { name: '选择照片' });
  const requiredCount = today.template.items.filter(
    (item) => item.photoRequired,
  ).length;
  for (let index = 0; index < requiredCount; index += 1) {
    const chooserPromise = page.waitForEvent('filechooser');
    await requiredItems.nth(index).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: `inspection-${index}.jpg`,
      mimeType: 'image/jpeg',
      buffer: Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2w==', 'base64'),
    });
  }
  await expect(page.getByText('已上传 1 张照片')).toHaveCount(requiredCount);
  await page.getByTestId('submit-inspection').click();
  await expect(page.getByText(/已提交：submitted/)).toBeVisible();
});

test('NB-002 打回单显示主管意见并可重新提交', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('邮箱').fill('inspector+nb-002@northbean.example');
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
  await page.getByTestId('login-button').click();
  await expect(page).toHaveURL('/today');
  await expect(page.getByRole('tab')).toHaveCount(2);
  await page.getByLabel('我的').click();
  await expect(page).toHaveURL('/profile');
  await page.getByLabel('今日待巡', { exact: true }).click();
  await expect(page).toHaveURL('/today');
  await page.getByTestId('start-inspection').click();
  await expect(page).toHaveURL(/\/inspection\/[0-9a-f-]+$/);
  await expect(page.getByRole('tab')).toHaveCount(0);
  await page.getByLabel('返回今日待巡').click();
  await expect(page).toHaveURL('/today');
  await expect(page.getByRole('tab')).toHaveCount(2);
});
