import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createPool } from '../../apps/api/src/db/client.js';

const slot = Number(process.env.FW_SLOT);
const apiBase = `http://127.0.0.1:${3100 + slot * 10}/api`;
const initialPassword = 'initial-password';
const changedPassword = 'changed-password';

test('FW-020 AC-08 管理员创建店员并完成首次改密', async ({ page }) => {
  const email = `fw020-${randomUUID()}@example.test`;
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  databaseUrl.pathname = `/floorwalk_e2e_${slot}`;
  const pool = createPool(databaseUrl.toString());
  try {
    await page.goto('/');
    await page.getByLabel('邮箱').fill('hq@northbean.example');
    await page.getByLabel('密码').fill('northbean-demo');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/console$/);

    await page.getByRole('button', { name: '账号', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: '账号', exact: true }),
    ).toBeVisible();
    await page.getByLabel('姓名').fill('FW-020 e2e 店员');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('初始密码').fill(initialPassword);
    await page.getByRole('button', { name: '创建账号' }).click();
    await expect(
      page.getByRole('row').filter({ hasText: email }),
    ).toContainText('待首次改密');
    const created = await page.request.get(`${apiBase}/admin/users`);
    expect(created.ok()).toBeTruthy();
    const user = (await created.json()).find(
      (entry: { email: string }) => entry.email === email,
    );
    expect(user).toBeTruthy();

    await page.getByRole('button', { name: '退出登录' }).click();
    await expect(page.getByLabel('邮箱')).toBeVisible();
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(initialPassword);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/change-password$/);
    await page.getByLabel('当前密码').fill(initialPassword);
    await page.getByLabel('新密码', { exact: true }).fill(changedPassword);
    await page.getByLabel('确认新密码', { exact: true }).fill(changedPassword);
    await page.getByRole('button', { name: '保存新密码' }).click();
    await expect(page).toHaveURL(/\/console$/);
    await expect(page.getByText('请使用手机端')).toBeVisible();
  } finally {
    await pool.query('DELETE FROM floorwalk.users WHERE email = $1', [email]);
    await pool.end();
  }
});
