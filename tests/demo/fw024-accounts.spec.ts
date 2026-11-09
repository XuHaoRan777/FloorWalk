import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createPool } from '../../apps/api/src/db/client.js';

test('FW-024 AC-08 Web 创建店长后在 Mobile 首次登录并进入今日巡检', async ({
  browser,
  page,
}) => {
  const slot = Number(process.env.FW_SLOT);
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  databaseUrl.pathname = `/floorwalk_e2e_${slot}`;
  const pool = createPool(databaseUrl.toString());
  const loginName = `fw024-${randomUUID()}@example.test`;
  const adminContext = await browser.newContext();
  try {
    const admin = await adminContext.newPage();
    await admin.goto(`http://127.0.0.1:${3101 + slot * 10}/`);
    await admin
      .getByLabel('登录名', { exact: true })
      .fill('hq@northbean.example');
    await admin.getByLabel('密码').fill('northbean-demo');
    await admin.getByRole('button', { name: '登录', exact: true }).click();
    await expect(admin).toHaveURL(/\/console$/);
    await admin.getByRole('button', { name: '账号', exact: true }).click();
    await admin.getByLabel('昵称', { exact: true }).fill('跨端验收店长');
    await admin.getByLabel('登录名（手机号或邮箱）').fill(loginName);
    await admin
      .getByLabel('门店', { exact: true })
      .selectOption({ label: 'NB-001 · Northbean Coffee 1' });
    await admin.getByLabel('初始密码').fill('initial-password');
    await admin.getByRole('button', { name: '创建店长' }).click();
    await expect(
      admin.getByRole('row').filter({ hasText: loginName }),
    ).toContainText('待首次改密');

    await page.goto('/');
    await page.getByLabel('登录名').fill(loginName);
    await page.getByLabel('密码').fill('initial-password');
    await page.getByTestId('login-button').click();
    await expect(page.getByRole('heading', { name: '修改密码' })).toBeVisible();
    await page.getByLabel('当前密码').fill('initial-password');
    await page.getByLabel('新密码', { exact: true }).fill('changed-password');
    await page
      .getByLabel('确认新密码', { exact: true })
      .fill('changed-password');
    await page.getByRole('button', { name: '保存新密码' }).click();
    await expect(page.getByRole('tab', { name: '今日待巡' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Northbean Coffee 1' }),
    ).toBeVisible();
  } finally {
    await adminContext.close();
    await pool.query('DELETE FROM floorwalk.users WHERE login_name = $1', [
      loginName,
    ]);
    await pool.end();
  }
});
