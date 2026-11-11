import { expect, test } from '@playwright/test';

const loginName = 'manager2@northbean.example';
const password = 'northbean-demo';
const apiBase = `http://127.0.0.1:${3100 + Number(process.env.FW_SLOT) * 10}/api`;

async function readToday(page: import('@playwright/test').Page) {
  const response = await page
    .context()
    .request.get(`${apiBase}/inspector/today`);
  expect(response.status()).toBe(200);
  return response.json() as Promise<{
    site: { name: string };
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
  await expect(
    page.getByRole('heading', { name: today.site.name }),
  ).toBeVisible();
  await expect(page.getByText('今日任务暂不可用')).toBeVisible();
  await expect(page.getByTestId('start-inspection')).toHaveCount(0);
  await expect(page.getByTestId('submit-inspection')).toHaveCount(0);

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

test('今日任务页不崩溃且隐藏旧建单和提交入口', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('登录名').fill(loginName);
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await expect(page.getByRole('tab', { name: '今日待巡' })).toBeVisible();
  await expect(page.getByText('今日任务暂不可用')).toBeVisible();
  await expect(page.getByTestId('start-inspection')).toHaveCount(0);
  await expect(page.getByTestId('submit-inspection')).toHaveCount(0);
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

test('FW-008 AC-03 Tabs 切换会更新 URL，今日页不暴露旧巡检入口', async ({
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
  await expect(page.getByRole('tab')).toHaveCount(3);
  await expect(page.getByTestId('start-inspection')).toHaveCount(0);
  await expect(page.getByTestId('submit-inspection')).toHaveCount(0);
});
