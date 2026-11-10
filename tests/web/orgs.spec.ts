import { expect, test } from '@playwright/test';
import { createPool } from '../../apps/api/src/db/client.js';

const slot = Number(process.env.FW_SLOT);
const apiBase = `http://127.0.0.1:${3100 + slot * 10}/api`;
const createdOrgIds: string[] = [];
const createdEmails: string[] = [];

test.afterAll(async () => {
  if (!createdOrgIds.length && !createdEmails.length) return;
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  databaseUrl.pathname = `/floorwalk_e2e_${slot}`;
  const pool = createPool(databaseUrl.toString());
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM floorwalk.email_verifications WHERE email = ANY($1::text[])',
      [createdEmails],
    );
    await client.query(
      `DELETE FROM floorwalk.sessions WHERE user_id IN
       (SELECT id FROM floorwalk.users WHERE org_id = ANY($1::uuid[]))`,
      [createdOrgIds],
    );
    await client.query(
      'DELETE FROM floorwalk.users WHERE org_id = ANY($1::uuid[])',
      [createdOrgIds],
    );
    await client.query(
      'DELETE FROM floorwalk.organizations WHERE id = ANY($1::uuid[])',
      [createdOrgIds],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
});

async function sendCode(
  page: import('@playwright/test').Page,
  path: string,
  email: string,
) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`${apiBase}${path}`) &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '发送验证码', exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  await expect(page.getByRole('status')).toContainText(
    '如果该邮箱可接收验证码，请查看邮箱。',
  );
  const mailbox = await page.request.get(`${apiBase}/testing/mailbox`, {
    params: { recipient: email },
  });
  expect(mailbox.status()).toBe(200);
  return (await mailbox.json()) as { code: string };
}

test('FW-019 AC-02 首页注册商家，自动进入空看板并刷新保持会话', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: '注册商家' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await page.getByLabel('商家名称').fill('注册界面商家');
  await page.getByLabel('管理员姓名').fill('注册管理员');
  const email = `fw019-web-${Date.now()}@example.test`;
  createdEmails.push(email);
  await page.getByLabel('邮箱', { exact: true }).fill(email);
  const registrationMail = await sendCode(
    page,
    '/auth/registration-code',
    email,
  );
  await page.getByLabel('邮箱验证码').fill(registrationMail.code);
  await expect(
    page.getByRole('button', { name: /60 秒后重新发送/ }),
  ).toBeDisabled();
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
  await page.getByRole('button', { name: '门店', exact: true }).click();
  await expect(page.getByText('暂无门店', { exact: true })).toBeVisible();
});

test('FW-025 AC-02 验证码错误显示中文提示并保留注册表单', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('商家名称').fill('重复邮箱商家');
  await page.getByLabel('管理员姓名').fill('管理员');
  const email = `fw025-wrong-code-${Date.now()}@example.test`;
  createdEmails.push(email);
  await page.getByLabel('邮箱', { exact: true }).fill(email);
  const mail = await sendCode(page, '/auth/registration-code', email);
  await page
    .getByLabel('邮箱验证码')
    .fill(mail.code === '000000' ? '000001' : '000000');
  await page.getByLabel('密码').fill('fw019-register-password');
  await page.getByRole('button', { name: '注册商家', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    '邮箱验证码错误或已过期。',
  );
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByLabel('商家名称')).toHaveValue('重复邮箱商家');
});

test('FW-025 AC-06 Web 注册与管理员密码找回', async ({ page }) => {
  const email = `fw025-recovery-web-${Date.now()}@example.test`;
  createdEmails.push(email);
  await page.goto('/register');
  await page.getByLabel('商家名称').fill('找回流程商家');
  await page.getByLabel('管理员姓名').fill('找回流程管理员');
  await page.getByLabel('邮箱', { exact: true }).fill(email);
  const registrationMail = await sendCode(
    page,
    '/auth/registration-code',
    email,
  );
  await page.getByLabel('邮箱验证码').fill(registrationMail.code);
  await page.getByLabel('密码').fill('fw025-original-password');
  const createdResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/orgs') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '注册商家', exact: true }).click();
  const registrationResponse = await createdResponse;
  expect(registrationResponse.status()).toBe(201);
  const created = await registrationResponse.json();
  createdOrgIds.push(created.org.id);
  await expect(page).toHaveURL(/\/console$/);

  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('link', { name: '忘记密码' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel('管理员邮箱').fill(email);
  const recoveryMail = await sendCode(
    page,
    '/auth/password-recovery-code',
    email,
  );
  const recoveryCode = recoveryMail.code;
  await page.getByLabel('验证码').fill(recoveryCode);
  await page.getByRole('button', { name: '验证并继续' }).click();
  await expect(page.getByText('商家：找回流程商家')).toBeVisible();
  await page
    .getByLabel('新密码', { exact: true })
    .fill('fw025-recovered-password');
  await page.getByLabel('确认新密码').fill('fw025-recovered-password');
  await page.getByRole('button', { name: '设置新密码' }).click();
  await expect(page.getByRole('status')).toContainText('密码已更新');

  await page.getByRole('link', { name: '返回登录' }).click();
  await page.getByLabel('登录名').fill(email);
  await page.getByLabel('密码').fill('fw025-recovered-password');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/console$/);
  await expect(page.getByRole('heading', { name: '总部看板' })).toBeVisible();
});
