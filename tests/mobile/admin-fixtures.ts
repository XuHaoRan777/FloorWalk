import { expect, type Page } from '@playwright/test';
import { createPool } from '../../apps/api/src/db/client.js';

export const slot = Number(process.env.FW_SLOT);
export const apiBase = `http://127.0.0.1:${3100 + slot * 10}/api`;

export async function loginAdmin(page: Page) {
  await page.goto('/');
  await page.getByLabel('登录名', { exact: true }).fill('hq@northbean.example');
  await page.getByLabel('密码', { exact: true }).fill('northbean-demo');
  await page.getByTestId('login-button').click();
  await page.getByRole('tab', { name: '管理' }).click();
  await expect(page.getByRole('heading', { name: '管理配置' })).toBeVisible();
}

export async function saveAdmin<T>(
  page: Page,
  path: string,
  method: string,
  button: string,
) {
  const pending = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api${path}`) &&
      response.request().method() === method,
  );
  await page.getByRole('button', { name: button, exact: true }).click();
  const response = await pending;
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<T>;
}

export async function cleanupPeople(userIds: string[], siteIds: string[]) {
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.pathname = `/floorwalk_e2e_${slot}`;
  const pool = createPool(url.toString());
  try {
    await pool.query(
      'DELETE FROM floorwalk.sessions WHERE user_id = ANY($1::uuid[])',
      [userIds],
    );
    await pool.query('DELETE FROM floorwalk.users WHERE id = ANY($1::uuid[])', [
      userIds,
    ]);
    await pool.query('DELETE FROM floorwalk.sites WHERE id = ANY($1::uuid[])', [
      siteIds,
    ]);
  } finally {
    await pool.end();
  }
}

export async function cleanupTemplates(
  templateIds: string[],
  standardIds: string[],
) {
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.pathname = `/floorwalk_e2e_${slot}`;
  const pool = createPool(url.toString());
  try {
    await pool.query(
      'DELETE FROM floorwalk.template_items WHERE template_id = ANY($1::uuid[])',
      [templateIds],
    );
    await pool.query(
      'DELETE FROM floorwalk.templates WHERE id = ANY($1::uuid[])',
      [templateIds],
    );
    await pool.query(
      'DELETE FROM floorwalk.ai_review_standards WHERE id = ANY($1::uuid[])',
      [standardIds],
    );
  } finally {
    await pool.end();
  }
}

export async function cleanupSchedules(
  scheduleIds: string[],
  siteIds: string[],
) {
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.pathname = `/floorwalk_e2e_${slot}`;
  const pool = createPool(url.toString());
  try {
    await pool.query(
      'DELETE FROM floorwalk.site_schedule_skips WHERE site_id = ANY($1::uuid[])',
      [siteIds],
    );
    await pool.query(
      'DELETE FROM floorwalk.site_schedules WHERE site_id = ANY($1::uuid[])',
      [siteIds],
    );
    await pool.query(
      'DELETE FROM floorwalk.schedules WHERE id = ANY($1::uuid[])',
      [scheduleIds],
    );
    await pool.query('DELETE FROM floorwalk.sites WHERE id = ANY($1::uuid[])', [
      siteIds,
    ]);
  } finally {
    await pool.end();
  }
}
