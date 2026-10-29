import {
  expect,
  test,
  type Page,
  type APIRequestContext,
} from '@playwright/test';

const configuredSlot = Number(process.env.FW_SLOT);
const apiBase = `http://127.0.0.1:${3100 + configuredSlot * 10}/api`;
const password = 'northbean-demo';

async function loginInspector(page: Page) {
  await page.goto('/');
  await page.getByLabel('邮箱').fill('inspector@northbean.example');
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
}

async function loginSupervisor(request: APIRequestContext) {
  const response = await request.post(`${apiBase}/auth/session`, {
    data: { email: 'supervisor@northbean.example', password },
  });
  expect(response.status()).toBe(201);
}

test('AC-06 停用门店隐藏新建入口，今日提示可见且历史接口可用', async ({
  page,
  request,
}) => {
  await loginSupervisor(request);
  const sitesResponse = await request.get(`${apiBase}/admin/sites`);
  const sites = (await sitesResponse.json()) as Array<{
    id: string;
    code: string;
    active: boolean;
  }>;
  const site = sites.find((entry) => entry.code === 'NB-001');
  expect(site).toBeTruthy();
  if (!site) throw new Error('NB-001 is missing');
  if (site.active) {
    const stopped = await request.patch(`${apiBase}/admin/sites/${site.id}`, {
      data: { active: false },
    });
    expect(stopped.ok()).toBeTruthy();
  }

  try {
    await loginInspector(page);
    await expect(page.getByRole('tab', { name: '今日待巡' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Northbean Coffee 1' }),
    ).toBeVisible();
    await expect(page.getByText('门店已停用', { exact: true })).toBeVisible();
    await expect(page.getByTestId('start-inspection')).toHaveCount(0);

    const recordsResponse = await page.request.get(
      `${apiBase}/inspector/inspections?limit=10`,
    );
    expect(recordsResponse.ok()).toBeTruthy();
    const records = (await recordsResponse.json()) as {
      items: Array<{ id: string; status: string }>;
    };
    expect(records.items.length).toBeGreaterThan(0);
    const history = await page.request.get(
      `${apiBase}/inspections/${records.items[0].id}`,
    );
    expect(history.ok()).toBeTruthy();

    await page.getByLabel('记录').click();
    await expect(page.getByRole('heading', { name: '巡检记录' })).toBeVisible();
  } finally {
    const active = await request.patch(`${apiBase}/admin/sites/${site.id}`, {
      data: { active: true },
    });
    expect(active.ok()).toBeTruthy();
  }
});
