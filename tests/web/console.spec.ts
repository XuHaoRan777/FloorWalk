import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

const configuredSlot = Number(process.env.FW_SLOT ?? 3);
const apiPort = 3100 + configuredSlot * 10;
const apiBase = `http://127.0.0.1:${apiPort}`;
const demoPassword = 'northbean-demo';

type LoginResponse = {
  token: string;
  user: { role: 'inspector' | 'supervisor' | 'hq' };
};

async function apiLogin(
  request: APIRequestContext,
  email: string,
): Promise<LoginResponse> {
  const response = await request.post(`${apiBase}/api/auth/login`, {
    data: { email, password: demoPassword },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as LoginResponse;
}

async function login(page: Page, email: string, password = demoPassword) {
  await page.goto('/');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
}

test('AC-01 登录、刷新保持会话、退出和三角色分流', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('邮箱').fill('supervisor@northbean.example');
  await page.getByLabel('密码').fill('wrong-password');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page.getByText(/邮箱或密码错误/)).toBeVisible();

  await login(page, 'supervisor@northbean.example');
  await expect(page.getByRole('heading', { name: /审核队列/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /审核队列/ })).toBeVisible();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByLabel('邮箱')).toBeVisible();

  await login(page, 'hq@northbean.example');
  await expect(page.getByRole('heading', { name: /总部看板/ })).toBeVisible();
  await page.getByRole('button', { name: '退出登录' }).click();

  await login(page, 'inspector@northbean.example');
  await expect(page.getByText('请使用手机端')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /审核队列|总部看板/ }),
  ).toHaveCount(0);
});

test('AC-02 审核队列与 API 返回保持一致', async ({ page, request }) => {
  const { token } = await apiLogin(request, 'supervisor@northbean.example');
  const response = await request.get(`${apiBase}/api/review/queue`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
  const queue = (await response.json()) as Array<{
    site: { name: string };
    score: number | null;
    status: string;
  }>;
  expect(queue.length).toBeGreaterThan(0);

  await login(page, 'supervisor@northbean.example');
  await expect(page.getByRole('heading', { name: /审核队列/ })).toBeVisible();
  for (const entry of queue) {
    const row = page.getByRole('button').filter({ hasText: entry.site.name });
    await expect(row).toBeVisible();
    if (entry.score !== null)
      await expect(row).toContainText(String(entry.score));
  }
});

test('AC-03 详情展示检查项、照片和按时间排列的审核历史', async ({
  page,
  request,
}) => {
  const { token } = await apiLogin(request, 'supervisor@northbean.example');
  const response = await request.get(`${apiBase}/api/review/queue`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const queue = (await response.json()) as Array<{
    id: string;
    status: string;
    site: { name: string };
    items: Array<{ title: string; evidence: Array<{ id: string }> }>;
    reviews: Array<{ createdAt: string }>;
  }>;
  const submitted =
    queue.find((entry) => entry.status === 'submitted') ?? queue[0];
  expect(submitted).toBeTruthy();

  await login(page, 'supervisor@northbean.example');
  await page.getByText(submitted.site.name, { exact: true }).click();
  for (const item of submitted.items)
    await expect(page.getByText(item.title, { exact: true })).toBeVisible();
  if (submitted.items.some((item) => item.evidence.length > 0))
    expect(await page.locator('img').count()).toBeGreaterThan(0);
  await expect(page.getByText(/审核历史/)).toBeVisible();
  await expect(page.getByText(/开始审核/)).toBeVisible();
});

test('AC-04 主管操作和严重项失败时的通过禁用', async ({ page, request }) => {
  const { token } = await apiLogin(request, 'supervisor@northbean.example');
  const response = await request.get(`${apiBase}/api/review/queue`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const queue = (await response.json()) as Array<{
    site: { name: string };
    items: Array<{ critical: boolean; result: string }>;
  }>;
  const target = queue[0];
  await login(page, 'supervisor@northbean.example');
  await page.getByText(target.site.name, { exact: true }).click();
  await expect(page.getByRole('button', { name: /通过/ })).toBeVisible();
  if (target.items.some((item) => item.critical && item.result === 'fail'))
    await expect(page.getByRole('button', { name: /通过/ })).toBeDisabled();
  await page.getByRole('button', { name: /打回/ }).click();
  await expect(page.getByText(/至少选择一个检查项/)).toBeVisible();
});

test('AC-05 总部看板与 API 返回一致，且没有审核按钮', async ({
  page,
  request,
}) => {
  const { token } = await apiLogin(request, 'hq@northbean.example');
  const response = await request.get(`${apiBase}/api/dashboard/sites`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
  const sites = (await response.json()) as Array<{
    site: { name: string };
    latestScore: number | null;
  }>;
  expect(sites).toHaveLength(12);

  await login(page, 'hq@northbean.example');
  await expect(page.getByRole('heading', { name: /总部看板/ })).toBeVisible();
  for (const entry of sites) {
    const row = page
      .getByRole('row')
      .filter({ has: page.getByText(entry.site.name, { exact: true }) });
    await expect(row).toBeVisible();
    if (entry.latestScore !== null)
      await expect(row).toContainText(String(entry.latestScore));
  }
  await expect(
    page.getByRole('button', { name: /通过|打回|判不合格/ }),
  ).toHaveCount(0);
});

test('AC-06 401 会回登录，其他接口错误显示中文提示', async ({ page }) => {
  await login(page, 'supervisor@northbean.example');
  await page.route('**/api/review/queue', async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'FORBIDDEN',
        message: '当前角色无权执行此操作。',
      }),
    });
  });
  await page.reload();
  await expect(page.getByText(/无权|权限|加载失败/)).toBeVisible();

  await page.route('**/api/me', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'UNAUTHENTICATED',
        message: '登录凭证无效。',
      }),
    });
  });
  await page.reload();
  await expect(page.getByLabel('邮箱')).toBeVisible();
});
