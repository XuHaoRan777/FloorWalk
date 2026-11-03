import { expect, test, type Page } from '@playwright/test';

const slot = Number(process.env.FW_SLOT);
const apiBase = `http://127.0.0.1:${3100 + slot * 10}/api`;

async function login(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill('northbean-demo');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/console$/);
}

test('FW-019 AC-04 管理员选择、替换、取消主管并持久化', async ({ page }) => {
  await login(page, 'hq@northbean.example');
  await page.getByRole('button', { name: '门店', exact: true }).click();
  const sitesResponse = await page.request.get(`${apiBase}/admin/sites`);
  expect(sitesResponse.ok()).toBeTruthy();
  const sites = (await sitesResponse.json()) as Array<{
    id: string;
    code: string;
    supervisor: { id: string; displayName: string } | null;
  }>;
  const usersResponse = await page.request.get(`${apiBase}/admin/users`);
  expect(usersResponse.ok()).toBeTruthy();
  const users = (await usersResponse.json()) as Array<{
    id: string;
    role: string;
    email: string;
    displayName: string;
  }>;
  const supervisors = users.filter((user) => user.role === 'supervisor');
  expect(supervisors.length).toBeGreaterThanOrEqual(2);
  const target = sites.find((site) => site.code === 'NB-004')!;
  expect(target).toBeTruthy();
  const select = page.getByLabel(`主管 ${target.code}`, { exact: true });
  await expect(select).toHaveValue(target.supervisor?.id ?? '');
  await expect(select.getByRole('option')).toHaveText([
    '未指派',
    ...supervisors.map((user) => `${user.displayName}（${user.email}）`),
  ]);
  try {
    for (const userId of [supervisors[1].id, supervisors[0].id, '']) {
      const changed = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/admin/sites/${target.id}/supervisor`) &&
          response.request().method() === 'PUT',
      );
      await select.selectOption(userId);
      expect((await changed).ok()).toBeTruthy();
      await expect(select).toHaveValue(userId);
      await page.reload();
      await page.getByRole('button', { name: '门店', exact: true }).click();
      await expect(select).toHaveValue(userId);
    }
    await page.screenshot({
      path: 'docs/work/FW-019-org-signup-site-supervisor/evidence/site-supervisor-controls.png',
    });
  } finally {
    const restored = await page.request.put(
      `${apiBase}/admin/sites/${target.id}/supervisor`,
      {
        data: { userId: target.supervisor?.id ?? null },
      },
    );
    expect(restored.ok()).toBeTruthy();
  }
});

test('FW-019 AC-04 主管只读当前主管，无指派控件', async ({ page }) => {
  await login(page, 'supervisor@northbean.example');
  await page.getByRole('button', { name: '门店', exact: true }).click();
  await expect(
    page.getByRole('cell', { name: '主管', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  const response = await page.request.get(`${apiBase}/admin/sites`);
  expect(response.ok()).toBeTruthy();
  const sites = (await response.json()) as Array<{
    code: string;
    supervisor: { displayName: string } | null;
  }>;
  for (const site of sites) {
    await expect(
      page.getByRole('row').filter({ hasText: site.code }),
    ).toContainText(site.supervisor?.displayName ?? '未指派');
  }
});

test('FW-019 AC-05 改指派后甲乙现有会话刷新队列立即切换门店范围', async ({
  browser,
}) => {
  const contexts = await Promise.all(
    [0, 1, 2].map(() =>
      browser.newContext({ baseURL: `http://127.0.0.1:${3101 + slot * 10}` }),
    ),
  );
  const [admin, first, second] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  let target: { id: string; supervisor: { id: string } | null } | undefined;
  try {
    await login(admin, 'hq@northbean.example');
    await login(first, 'supervisor@northbean.example');
    await login(second, 'supervisor+2@northbean.example');
    const firstEntry = first.getByRole('button').filter({ hasText: 'NB-004' });
    const secondEntry = second
      .getByRole('button')
      .filter({ hasText: 'NB-004' });
    await expect(firstEntry).toHaveCount(1);
    await expect(
      second.getByRole('heading', { name: '审核队列', exact: true }),
    ).toBeVisible();
    await expect(secondEntry).toHaveCount(0);
    const sitesResponse = await admin.request.get(`${apiBase}/admin/sites`);
    expect(sitesResponse.ok()).toBeTruthy();
    target = (await sitesResponse.json()).find(
      (site: { code: string }) => site.code === 'NB-004',
    );
    expect(target).toBeTruthy();
    const usersResponse = await admin.request.get(`${apiBase}/admin/users`);
    expect(usersResponse.ok()).toBeTruthy();
    const secondSupervisor = (await usersResponse.json()).find(
      (user: { email: string }) =>
        user.email === 'supervisor+2@northbean.example',
    );
    await admin.getByRole('button', { name: '门店', exact: true }).click();
    const assigned = admin.waitForResponse(
      (response) =>
        response.url().endsWith(`/admin/sites/${target!.id}/supervisor`) &&
        response.request().method() === 'PUT',
    );
    await admin
      .getByLabel('主管 NB-004', { exact: true })
      .selectOption(secondSupervisor.id);
    expect((await assigned).ok()).toBeTruthy();
    const firstRefreshed = first.waitForResponse((response) =>
      response.url().endsWith('/review/queue'),
    );
    await first.getByRole('button', { name: '刷新队列', exact: true }).click();
    expect((await firstRefreshed).ok()).toBeTruthy();
    await expect(firstEntry).toHaveCount(0);
    const secondRefreshed = second.waitForResponse((response) =>
      response.url().endsWith('/review/queue'),
    );
    await second.getByRole('button', { name: '刷新队列', exact: true }).click();
    expect((await secondRefreshed).ok()).toBeTruthy();
    await expect(secondEntry).toHaveCount(1);
    await first.screenshot({
      path: 'docs/work/FW-019-org-signup-site-supervisor/evidence/queue-first-after-assignment.png',
    });
    await second.screenshot({
      path: 'docs/work/FW-019-org-signup-site-supervisor/evidence/queue-second-after-assignment.png',
    });
  } finally {
    try {
      if (target) {
        const restored = await admin.request.put(
          `${apiBase}/admin/sites/${target.id}/supervisor`,
          {
            data: { userId: target.supervisor?.id ?? null },
          },
        );
        expect(restored.ok()).toBeTruthy();
      }
    } finally {
      for (const context of contexts) {
        await context.request.delete(`${apiBase}/auth/session`);
        await context.close();
      }
    }
  }
});
