import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createPool } from '../../apps/api/src/db/client.js';

const slot = Number(process.env.FW_SLOT);
const apiBase = `http://127.0.0.1:${3100 + slot * 10}/api`;

test('FW-020 AC-05 Mobile 首次登录强制改密后进入今日巡检', async ({ page }) => {
  const email = `fw020-mobile-${randomUUID()}@example.test`;
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  databaseUrl.pathname = `/floorwalk_e2e_${slot}`;
  const pool = createPool(databaseUrl.toString());
  try {
    const adminLogin = await page.request.post(`${apiBase}/auth/session`, {
      data: {
        loginName: 'hq@northbean.example',
        password: 'northbean-demo',
      },
    });
    expect(adminLogin.status()).toBe(201);
    const sitesResponse = await page.request.get(`${apiBase}/admin/sites`);
    const sites = (await sitesResponse.json()) as Array<{ id: string }>;
    const created = await page.request.post(`${apiBase}/admin/users`, {
      data: {
        loginName: email,
        displayName: 'FW-020 Mobile e2e',
        role: 'store_manager',
        siteId: sites[0].id,
        password: 'initial-password',
      },
    });
    expect(created.status()).toBe(201);
    await page.request.delete(`${apiBase}/auth/session`);

    await page.goto('/');
    await page.getByLabel('登录名').fill(email);
    await page.getByLabel('密码').fill('initial-password');
    await page.getByTestId('login-button').click();
    await expect(page.getByRole('heading', { name: '修改密码' })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0);
    await page.getByLabel('当前密码').fill('initial-password');
    await page.getByLabel('新密码', { exact: true }).fill('changed-password');
    await page
      .getByLabel('确认新密码', { exact: true })
      .fill('changed-password');
    await page.getByRole('button', { name: '保存新密码' }).click();
    await expect(page.getByRole('tab', { name: '今日待巡' })).toBeVisible();
  } finally {
    await pool.query('DELETE FROM floorwalk.users WHERE login_name = $1', [
      email,
    ]);
    await pool.end();
  }
});

for (const [orgName, siteName] of [
  ['Northbean', 'Northbean Coffee 1'],
  ['演示二号', '演示二号门店'],
] as const) {
  test(`FW-024 AC-08 Mobile 选择 ${orgName} 后进入对应门店`, async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByLabel('登录名').fill('inspector@northbean.example');
    await page.getByLabel('密码').fill('northbean-demo');
    await page.getByTestId('login-button').click();
    await expect(
      page.getByRole('button', { name: 'Northbean', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '演示二号', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: orgName, exact: true }).click();
    await expect(page.getByRole('heading', { name: siteName })).toBeVisible();
    const session = await page.evaluate(async (base) => {
      const response = await fetch(`${base}/me`, { credentials: 'include' });
      return response.json();
    }, apiBase);
    expect(session.org.name).toBe(orgName);
  });
}
