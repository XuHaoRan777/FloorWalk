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
