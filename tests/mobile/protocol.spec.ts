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
        email: 'hq@northbean.example',
        password: 'northbean-demo',
      },
    });
    expect(adminLogin.status()).toBe(201);
    const sitesResponse = await page.request.get(`${apiBase}/admin/sites`);
    const sites = (await sitesResponse.json()) as Array<{ id: string }>;
    const created = await page.request.post(`${apiBase}/admin/users`, {
      data: {
        email,
        displayName: 'FW-020 Mobile e2e',
        role: 'inspector',
        siteId: sites[0].id,
        password: 'initial-password',
      },
    });
    expect(created.status()).toBe(201);
    await page.request.delete(`${apiBase}/auth/session`);

    await page.goto('/');
    await page.getByLabel('邮箱').fill(email);
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
    await pool.query('DELETE FROM floorwalk.users WHERE email = $1', [email]);
    await pool.end();
  }
});
