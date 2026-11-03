import { expect, test } from '@playwright/test';
import { createPool } from '../../apps/api/src/db/client.js';

const slot = Number(process.env.FW_SLOT);
const apiBase = `http://127.0.0.1:${3100 + slot * 10}/api`;
const createdOrgIds: string[] = [];

test.afterAll(async () => {
  if (!createdOrgIds.length) return;
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  databaseUrl.pathname = `/floorwalk_e2e_${slot}`;
  const pool = createPool(databaseUrl.toString());
  try {
    await pool.query(
      `DELETE FROM floorwalk.sessions WHERE user_id IN
       (SELECT id FROM floorwalk.users WHERE org_id = ANY($1::uuid[]))`,
      [createdOrgIds],
    );
    await pool.query(
      'DELETE FROM floorwalk.users WHERE org_id = ANY($1::uuid[])',
      [createdOrgIds],
    );
    await pool.query(
      'DELETE FROM floorwalk.organizations WHERE id = ANY($1::uuid[])',
      [createdOrgIds],
    );
  } finally {
    await pool.end();
  }
});

test('FW-019 AC-02 首页注册商家，自动进入空看板并刷新保持会话', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: '注册商家' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await page.getByLabel('商家名称').fill('注册界面商家');
  await page.getByLabel('管理员姓名').fill('注册管理员');
  await page.getByLabel('邮箱').fill(`fw019-web-${Date.now()}@example.test`);
  await page.getByLabel('密码').fill('fw019-register-password');
  const createdResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/orgs') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '注册商家', exact: true }).click();
  const response = await createdResponse;
  expect(response.status()).toBe(201);
  const created = await response.json();
  createdOrgIds.push(created.org.id);
  await expect(page).toHaveURL(/\/console$/);
  await expect(page.getByRole('heading', { name: '总部看板' })).toBeVisible();
  await expect(page.getByText('暂无门店数据')).toBeVisible();
  expect(
    (await page.request.get(`${apiBase}/dashboard/sites`)).ok(),
  ).toBeTruthy();
  await page.reload();
  await expect(page.getByText('暂无门店数据')).toBeVisible();
  await page.screenshot({
    path: 'docs/work/FW-019-org-signup-site-supervisor/evidence/registration-dashboard.png',
  });
  await page.getByRole('button', { name: '门店', exact: true }).click();
  await expect(page.getByText('暂无主管', { exact: true })).toBeVisible();
  await expect(page.getByText('暂无门店', { exact: true })).toBeVisible();
});

test('FW-019 AC-02 注册失败显示中文提示并保留表单', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('商家名称').fill('重复邮箱商家');
  await page.getByLabel('管理员姓名').fill('管理员');
  await page.getByLabel('邮箱').fill('hq@northbean.example');
  await page.getByLabel('密码').fill('fw019-register-password');
  await page.getByRole('button', { name: '注册商家', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('该邮箱已被注册。');
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByLabel('商家名称')).toHaveValue('重复邮箱商家');
  await page.screenshot({
    path: 'docs/work/FW-019-org-signup-site-supervisor/evidence/registration-error.png',
  });
});
