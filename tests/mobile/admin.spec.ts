import { expect, test } from '@playwright/test';

async function login(page: import('@playwright/test').Page, loginName: string) {
  await page.goto('/');
  await page.getByLabel('登录名').fill(loginName);
  await page.getByLabel('密码').fill('northbean-demo');
  await page.getByTestId('login-button').click();
  if (loginName === 'inspector@northbean.example') {
    await page.getByRole('button', { name: 'Northbean', exact: true }).click();
  }
}

test('管理员登录进入管理主页并看到六个配置入口', async ({ page }) => {
  await login(page, 'hq@northbean.example');
  await expect(page.getByRole('heading', { name: '管理员主页' })).toBeVisible();
  for (const testID of [
    'admin-entry-accounts',
    'admin-entry-sites',
    'admin-entry-templates',
    'admin-entry-ai-standards',
    'admin-entry-schedules',
    'admin-entry-site-schedules',
  ]) {
    await expect(page.getByTestId(testID)).toBeVisible();
  }
  await expect(page.getByRole('tab')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: '管理员主页' })).toBeVisible();
  await page.getByTestId('admin-logout').click();
  await expect(page.getByTestId('login-button')).toBeVisible();
});

test('店长只看到巡检 Tabs 且不能打开管理路由', async ({ page }) => {
  await login(page, 'inspector@northbean.example');
  await expect(page.getByRole('tab', { name: '今日待巡' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '管理员主页' })).toHaveCount(
    0,
  );
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: '管理员主页' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('tab', { name: '今日待巡' })).toBeVisible();
  await page.getByRole('tab', { name: '我的' }).click();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByTestId('login-button')).toBeVisible();
});
