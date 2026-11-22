import { expect, test } from '@playwright/test';
import { createPool } from '../../apps/api/src/db/client.js';

type ExistingNotification = {
  id: string;
  orgId: string;
  userId: string;
  type: string;
  payload: unknown;
  createdAt: string;
  readAt: string | null;
};

const slot = Number(process.env.FW_SLOT);
const apiBase = `http://127.0.0.1:${3100 + slot * 10}/api`;
const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
databaseUrl.pathname = `/floorwalk_e2e_${slot}`;
const pool = createPool(databaseUrl.toString());
let notificationId: string | undefined;
let previousNotifications: ExistingNotification[] = [];

test.beforeEach(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const seeded = await client.query<{ userId: string; taskId: string }>(
      `SELECT account.id AS "userId", task.id AS "taskId"
       FROM floorwalk.users account
       JOIN floorwalk.inspection_tasks task ON task.org_id = account.org_id
       WHERE account.login_name = 'hq@northbean.example'
       ORDER BY task.task_date DESC, task.created_at DESC LIMIT 1`,
    );
    const target = seeded.rows[0];
    expect(target).toBeTruthy();
    if (!target) throw new Error('缺少通知测试所需的巡检任务种子。');

    const existing = await client.query<ExistingNotification>(
      `SELECT id, org_id AS "orgId", user_id AS "userId", type,
         payload_json AS payload, created_at::text AS "createdAt",
         read_at::text AS "readAt"
       FROM floorwalk.notifications WHERE user_id = $1`,
      [target.userId],
    );
    previousNotifications = existing.rows;
    await client.query(
      'DELETE FROM floorwalk.notifications WHERE user_id = $1',
      [target.userId],
    );
    const created = await client.query<{ id: string }>(
      `INSERT INTO floorwalk.notifications (org_id, user_id, type, payload_json)
       SELECT org_id, id, 'task_overdue', $2::jsonb FROM floorwalk.users WHERE id = $1
       RETURNING id`,
      [target.userId, JSON.stringify({ taskId: target.taskId })],
    );
    notificationId = created.rows[0].id;
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    previousNotifications = [];
    notificationId = undefined;
    throw error;
  } finally {
    client.release();
  }
});

test.afterEach(async ({ page }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (notificationId)
      await client.query('DELETE FROM floorwalk.notifications WHERE id = $1', [
        notificationId,
      ]);
    if (previousNotifications.length) {
      const values = previousNotifications.flatMap((notification) => [
        notification.id,
        notification.orgId,
        notification.userId,
        notification.type,
        JSON.stringify(notification.payload),
        notification.createdAt,
        notification.readAt,
      ]);
      const rows = previousNotifications.map((_, index) => {
        const offset = index * 7;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}::jsonb, $${offset + 6}, $${offset + 7})`;
      });
      await client.query(
        `INSERT INTO floorwalk.notifications
           (id, org_id, user_id, type, payload_json, created_at, read_at)
         VALUES ${rows.join(', ')}`,
        values,
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    notificationId = undefined;
    previousNotifications = [];
  }
  await page.request.delete(`${apiBase}/auth/session`).catch(() => undefined);
});

test.afterAll(async () => {
  await pool.end();
});

test('FW-036 AC-04 通知面板显示未读并标记后跳转任务详情', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('登录名').fill('hq@northbean.example');
  await page.getByLabel('密码').fill('northbean-demo');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/console$'));

  const trigger = page.getByRole('button', { name: '通知，1 条未读' });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const entry = page.getByRole('button').filter({ hasText: '巡检任务逾期' });
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page.getByRole('heading', { name: '检查项' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^通知$/ })).toBeVisible();
  await page
    .getByLabel('控制台导航')
    .getByRole('button', { name: '今日视图', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: '今日视图' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '检查项' })).toHaveCount(0);

  const stored = await pool.query<{ readAt: Date | null }>(
    'SELECT read_at AS "readAt" FROM floorwalk.notifications WHERE id = $1',
    [notificationId],
  );
  expect(stored.rows[0]?.readAt).not.toBeNull();
});
