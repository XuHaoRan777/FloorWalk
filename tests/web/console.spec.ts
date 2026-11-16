import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import type { DashboardPeriodResponse, TaskReview } from '@libs/shared';

const configuredSlot = Number(process.env.FW_SLOT ?? 3);
const apiPort = 3100 + configuredSlot * 10;
const apiBase = `http://127.0.0.1:${apiPort}`;
const demoPassword = 'northbean-demo';

async function apiLogin(request: APIRequestContext, loginName: string) {
  const response = await request.post(`${apiBase}/api/auth/session`, {
    data: { loginName, password: demoPassword },
  });
  expect(response.status()).toBe(201);
  return response;
}

async function login(page: Page, loginName: string, password = demoPassword) {
  await page.goto('/');
  await page.getByLabel('登录名').fill(loginName);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
}

test('管理员进入审核队列，店长 Web 端只显示手机端提示', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('登录名').fill('inspector@northbean.example');
  await page.getByLabel('密码').fill('wrong-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByText(/登录名或密码错误/)).toBeVisible();

  await login(page, 'inspector+nb-002@northbean.example');
  await expect(page.getByText('请使用手机端')).toBeVisible();
  await expect(page.getByRole('button', { name: '审核队列' })).toHaveCount(0);
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByLabel('登录名')).toBeVisible();

  await login(page, 'hq@northbean.example');
  await expect(page.getByRole('heading', { name: /总部看板/ })).toBeVisible();
  await page
    .getByLabel('控制台导航')
    .getByRole('button', { name: '审核队列', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: '审核队列' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '查看任务' }).first(),
  ).toBeVisible();
});

test('审核队列与任务审核 API 返回保持一致', async ({ page, request }) => {
  await apiLogin(request, 'hq@northbean.example');
  const response = await request.get(`${apiBase}/api/review/tasks`);
  expect(response.ok()).toBeTruthy();
  const queue = (await response.json()) as TaskReview[];
  expect(queue.length).toBeGreaterThan(0);

  await login(page, 'hq@northbean.example');
  await page
    .getByLabel('控制台导航')
    .getByRole('button', { name: '审核队列', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: '审核队列' })).toBeVisible();
  for (const task of queue) {
    const row = page
      .getByRole('button')
      .filter({ hasText: task.site.name })
      .filter({ hasText: task.taskDate });
    await expect(row.first()).toBeVisible();
    if (task.score !== null)
      await expect(row.first()).toContainText(String(task.score));
  }
});

test('审核详情展示逐项结论、照片、上传人和聊天', async ({ page, request }) => {
  await apiLogin(request, 'hq@northbean.example');
  const response = await request.get(`${apiBase}/api/review/tasks`);
  const queue = (await response.json()) as TaskReview[];
  const target = queue.find(
    (task) =>
      task.inspectionId && task.items.some((item) => item.evidence.length),
  );
  expect(target).toBeTruthy();
  if (!target) return;

  await login(page, 'hq@northbean.example');
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
  await expect(
    page.getByRole('heading', { name: target.site.name }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '检查项' })).toBeVisible();
  for (const item of target.items) {
    await expect(
      page.getByText(item.title, { exact: false }).first(),
    ).toBeVisible();
    if (item.uploadedAt) {
      await expect(
        page
          .getByText(new RegExp(`${item.uploadedByName ?? '系统'} · 上传于`))
          .first(),
      ).toBeVisible();
    }
  }
  await expect(page.getByRole('heading', { name: '巡检聊天' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '聊天内容' })).toHaveCount(0);
  await expect(page.getByLabel('选择聊天图片')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '发送' })).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator('img')
        .evaluateAll((elements) =>
          elements.some(
            (element) => (element as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
});

test('总部看板与 API 返回一致，且不显示条目判定按钮', async ({
  page,
  request,
}) => {
  await apiLogin(request, 'hq@northbean.example');
  const response = await request.get(
    `${apiBase}/api/dashboard/period?period=week`,
  );
  expect(response.ok()).toBeTruthy();
  const { sites, overall } = (await response.json()) as DashboardPeriodResponse;
  expect(sites).toHaveLength(12);
  expect(
    sites
      .filter((entry) => entry.site.code.startsWith('NB-'))
      .map((entry) => entry.site.code)
      .sort(),
  ).toEqual(
    Array.from(
      { length: 12 },
      (_, index) => `NB-${String(index + 1).padStart(3, '0')}`,
    ),
  );
  expect(sites.filter((entry) => entry.site.code === 'DEMO2-001')).toHaveLength(
    0,
  );

  await login(page, 'hq@northbean.example');
  await expect(page.getByRole('heading', { name: /总部看板/ })).toBeVisible();
  if (overall.expected === 0) {
    await expect(page.getByText('本周暂无数据')).toBeVisible();
  } else {
    for (const entry of sites) {
      const row = page
        .getByRole('row')
        .filter({ has: page.getByText(entry.site.name, { exact: true }) });
      await expect(row).toBeVisible();
      await expect(row).toContainText(
        `${entry.metrics.completed}/${entry.metrics.expected}`,
      );
    }
  }
  await expect(
    page.getByRole('button', { name: /通过|打回|不合格/ }),
  ).toHaveCount(0);
});

test('审核队列错误、断网与失效会话均有处理', async ({ page }) => {
  await login(page, 'hq@northbean.example');
  await page
    .getByLabel('控制台导航')
    .getByRole('button', { name: '审核队列', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: '审核队列' })).toBeVisible();
  for (const [status, expected] of [
    [403, /无权|权限/],
    [409, /状态已变化/],
    [422, /内容不完整/],
  ] as const) {
    await page.route('**/api/review/tasks', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: '{}',
      });
    });
    await page.getByRole('button', { name: '刷新队列' }).click();
    await expect(page.getByText(expected)).toBeVisible();
    await page.unroute('**/api/review/tasks');
  }
  await page.route('**/api/review/tasks', (route) => route.abort());
  await page.getByRole('button', { name: '刷新队列' }).click();
  await expect(page.getByText(/网络连接失败/)).toBeVisible();
  await page.unroute('**/api/review/tasks');

  await page.route('**/api/review/tasks', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'UNAUTHENTICATED',
        message: '登录凭证无效。',
      }),
    });
  });
  await page.getByRole('button', { name: '刷新队列' }).click();
  await expect(page.getByLabel('登录名')).toBeVisible();
});

test('会话 ID 不暴露给脚本，刷新保持登录，退出后失效', async ({ page }) => {
  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/auth/session') &&
      response.request().method() === 'POST',
  );
  await login(page, 'hq@northbean.example');
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(201);

  const cookieHeader = await loginResponse.headerValue('set-cookie');
  const sessionId = cookieHeader?.match(/(?:^|,\s*)fw_session=([^;]*)/)?.[1];
  expect(typeof sessionId === 'string' && sessionId.length > 0).toBe(true);
  if (!sessionId) throw new Error('Login response did not set fw_session');

  await expect(page.getByRole('heading', { name: /总部看板/ })).toBeVisible();
  const storageContainsSessionId = await page.evaluate((id) => {
    const values = [localStorage, sessionStorage].flatMap((storage) =>
      Array.from({ length: storage.length }, (_, index) =>
        storage.getItem(storage.key(index) ?? ''),
      ),
    );
    return values.some((value) => value?.includes(id));
  }, sessionId);
  expect(storageContainsSessionId).toBe(false);
  expect(
    await page.evaluate(() => document.cookie.includes('fw_session')),
  ).toBe(false);

  await page.reload();
  await expect(page.getByRole('heading', { name: /总部看板/ })).toBeVisible();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByLabel('登录名')).toBeVisible();
  expect((await page.request.get(`${apiBase}/api/me`)).status()).toBe(401);
});
