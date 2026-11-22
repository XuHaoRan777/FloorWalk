import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createPool } from '../../apps/api/src/db/client.js';

const slot = Number(process.env.FW_SLOT);
const apiBase = `http://127.0.0.1:${3100 + slot * 10}/api`;
const initialPassword = 'initial-password';
const changedPassword = 'changed-password';

test('FW-024 AC-08 管理员创建店长并完成首次改密', async ({ page }) => {
  const email = `fw020-${randomUUID()}@example.test`;
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  databaseUrl.pathname = `/floorwalk_e2e_${slot}`;
  const pool = createPool(databaseUrl.toString());
  try {
    await page.goto('/');
    await page
      .getByLabel('登录名', { exact: true })
      .fill('hq@northbean.example');
    await page.getByLabel('密码').fill('northbean-demo');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/console$/);

    await page.getByRole('button', { name: '人员管理', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: '人员管理', exact: true }),
    ).toBeVisible();
    await page.getByLabel('昵称', { exact: true }).fill('FW-024 e2e 店长');
    await page.getByLabel('登录名（手机号或邮箱）').fill(email);
    await page
      .getByRole('combobox', { name: '门店', exact: true })
      .selectOption({ label: 'NB-001 · Northbean Coffee 1' });
    await page.getByLabel('初始密码').fill(initialPassword);
    await page.getByRole('button', { name: '创建店长' }).click();
    await expect(
      page.getByRole('row').filter({ hasText: email }),
    ).toContainText('待首次改密');
    const created = await page.request.get(`${apiBase}/admin/users`);
    expect(created.ok()).toBeTruthy();
    const user = (await created.json()).find(
      (entry: { loginName: string }) => entry.loginName === email,
    );
    expect(user).toBeTruthy();

    await page.getByRole('button', { name: '退出登录' }).click();
    await expect(page).toHaveURL('/');
    const loginForm = page.getByRole('region', { name: '登录工作台' });
    await expect(loginForm.getByLabel('登录名')).toBeVisible();
    await loginForm.getByLabel('登录名').fill(email);
    await loginForm.getByLabel('密码').fill(initialPassword);
    await loginForm.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/change-password$/);
    await page.getByLabel('当前密码').fill(initialPassword);
    await page.getByLabel('新密码', { exact: true }).fill(changedPassword);
    await page.getByLabel('确认新密码', { exact: true }).fill(changedPassword);
    await page.getByRole('button', { name: '保存新密码' }).click();
    await expect(page).toHaveURL(/\/console$/);
    await expect(page.getByText('请使用手机端')).toBeVisible();
  } finally {
    await pool.query('DELETE FROM floorwalk.users WHERE login_name = $1', [
      email,
    ]);
    await pool.end();
  }
});

for (const orgName of ['Northbean', '演示二号']) {
  test(`FW-024 AC-08 Web 选择 ${orgName} 后进入对应商家`, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('登录名').fill('inspector@northbean.example');
    await page.getByLabel('密码').fill('northbean-demo');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    const selector = page.getByLabel('选择商家');
    await expect(selector).toBeVisible();
    await selector.selectOption({ label: orgName });
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/console$/);
    await expect(page.getByText('请使用手机端')).toBeVisible();
    const session = await page.evaluate(async (base) => {
      const response = await fetch(`${base}/me`, { credentials: 'include' });
      return response.json();
    }, apiBase);
    expect(session.org.name).toBe(orgName);
  });
}
