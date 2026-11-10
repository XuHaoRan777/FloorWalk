import { randomUUID } from 'node:crypto';
import { afterAll, expect, test } from '@playwright/test';
import { createPool } from '../../apps/api/src/db/client.js';

const slot = Number(process.env.FW_SLOT);
const apiBase = `http://127.0.0.1:${3100 + slot * 10}/api`;
const email = `fw025-mobile-${randomUUID()}@example.test`;
const createdOrgIds: string[] = [];

function slotPool() {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  databaseUrl.pathname = `/floorwalk_e2e_${slot}`;
  return createPool(databaseUrl.toString());
}

async function registerMerchant(
  page: import('@playwright/test').Page,
  orgName: string,
) {
  const requested = await page.request.post(
    `${apiBase}/auth/registration-code`,
    { data: { email } },
  );
  expect(requested.status()).toBe(201);
  const mailbox = await page.request.get(
    `${apiBase}/testing/mailbox?recipient=${encodeURIComponent(email)}`,
  );
  expect(mailbox.status()).toBe(200);
  const created = await page.request.post(`${apiBase}/orgs`, {
    data: {
      orgName,
      adminName: 'Mobile 找回管理员',
      email,
      verificationCode: (await mailbox.json()).code,
      password: 'initial-password',
    },
  });
  expect(created.status()).toBe(201);
  const body = await created.json();
  createdOrgIds.push(body.org.id);
  return body.org as { id: string; name: string };
}

afterAll(async () => {
  if (!createdOrgIds.length) return;
  const pool = slotPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM floorwalk.sessions
       WHERE user_id IN (SELECT id FROM floorwalk.users WHERE org_id = ANY($1::uuid[]))`,
      [createdOrgIds],
    );
    await client.query(
      'DELETE FROM floorwalk.email_verifications WHERE email = $1',
      [email],
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

test('Mobile 管理员可验证邮箱、选择商家并重设密码', async ({ page }) => {
  const firstOrg = await registerMerchant(page, `FW025 Mobile 甲 ${randomUUID()}`);
  const pool = slotPool();
  try {
    await pool.query(
      `UPDATE floorwalk.email_verifications
       SET requested_at = now() - interval '61 seconds'
       WHERE email = $1 AND purpose = 'registration'`,
      [email],
    );
  } finally {
    await pool.end();
  }
  const secondOrg = await registerMerchant(
    page,
    `FW025 Mobile 乙 ${randomUUID()}`,
  );

  await page.context().clearCookies();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '开始巡检' })).toBeVisible();
  await page.getByLabel('登录名', { exact: true }).fill('13800000000');
  await page.getByTestId('forgot-password-link').click();
  await expect(page).toHaveURL(/\/forgot-password\?/);
  await expect(
    page.getByText('店长忘记密码，请联系商家管理员重置。'),
  ).toBeVisible();
  await expect(page.getByTestId('recovery-email')).toHaveValue('13800000000');
  await page.getByTestId('recovery-request-code').click();
  await expect(
    page.getByText('店长忘记密码，请联系商家管理员重置。', { exact: true }),
  ).toBeVisible();
  await page.getByTestId('recovery-email').fill(email);
  const requestResponse = page.waitForResponse(
    (response) => response.url().endsWith('/api/auth/password-recovery-code'),
  );
  await page.getByTestId('recovery-request-code').click();
  expect((await requestResponse).status()).toBe(201);
  await expect(
    page.getByText('如果该邮箱可接收验证码，请查看邮箱。'),
  ).toBeVisible();
  const mailbox = await page.request.get(
    `${apiBase}/testing/mailbox?recipient=${encodeURIComponent(email)}`,
  );
  expect(mailbox.status()).toBe(200);
  await page.getByTestId('recovery-code').fill((await mailbox.json()).code);
  const verifyResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/password-recovery/verify'),
  );
  await page.getByTestId('recovery-verify-code').click();
  expect((await verifyResponse).status()).toBe(201);

  await expect(
    page.getByText('请选择要重设密码的商家。'),
  ).toBeVisible();
  await page.getByRole('button', { name: firstOrg.name }).click();
  await page.getByTestId('recovery-new-password').fill('new-admin-password');
  const resetResponse = page.waitForResponse(
    (response) => response.url().endsWith('/api/auth/password-recovery/reset'),
  );
  await page.getByTestId('recovery-reset-password').click();
  expect((await resetResponse).status()).toBe(204);
  await expect(page.getByRole('heading', { name: '密码已更新' })).toBeVisible();

  const oldPassword = await page.request.post(`${apiBase}/auth/session`, {
    data: {
      loginName: email,
      orgId: firstOrg.id,
      password: 'initial-password',
    },
  });
  expect(oldPassword.status()).toBe(401);
  const otherMerchant = await page.request.post(`${apiBase}/auth/session`, {
    data: {
      loginName: email,
      orgId: secondOrg.id,
      password: 'initial-password',
    },
  });
  expect(otherMerchant.status()).toBe(201);
  const newPassword = await page.request.post(`${apiBase}/auth/session`, {
    data: {
      loginName: email,
      orgId: firstOrg.id,
      password: 'new-admin-password',
    },
  });
  expect(newPassword.status()).toBe(201);
  expect((await newPassword.json()).user.mustChangePassword).toBe(false);
});
