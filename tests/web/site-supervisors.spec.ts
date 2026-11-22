import { expect, test } from '@playwright/test';

const slot = Number(process.env.FW_SLOT);
const apiBase = `http://127.0.0.1:${3100 + slot * 10}/api`;

test('管理员门店页显示门店、店长与状态', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('登录名').fill('hq@northbean.example');
  await page.getByLabel('密码').fill('northbean-demo');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/console$/);

  const response = await page.request.get(`${apiBase}/admin/sites`);
  expect(response.ok()).toBeTruthy();
  const sites = (await response.json()) as Array<{
    id: string;
    code: string;
    name: string;
    active: boolean;
    storeManagers: Array<{ displayName: string }>;
  }>;
  await page
    .getByLabel('控制台导航')
    .getByRole('button', { name: '门店', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: '门店', exact: true }),
  ).toBeVisible();
  for (const site of sites) {
    const row = page.getByRole('row').filter({ hasText: site.code });
    await expect(row).toContainText(site.name);
    await expect(row).toContainText(site.active ? '启用' : '已停用');
    await expect(row).toContainText(
      site.storeManagers.map((manager) => manager.displayName).join('、') ||
        '暂无店长',
    );
  }
});

test('店长 Web 端不显示管理员审核与配置页面', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('登录名').fill('inspector+nb-002@northbean.example');
  await page.getByLabel('密码').fill('northbean-demo');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByText('请使用手机端')).toBeVisible();
  for (const name of ['审核队列', '门店', '模板', '人员管理'])
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(
      0,
    );
});
