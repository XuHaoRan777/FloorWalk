import { expect, test } from '@playwright/test';
import type { AdminSchedule, AdminTemplatesResponse, Site } from '@libs/shared';
import { createPool } from '../../apps/api/src/db/client.js';

const configuredSlot = Number(process.env.FW_SLOT);
const apiBase = `http://127.0.0.1:${3100 + configuredSlot * 10}/api`;
const createdSiteIds: string[] = [];
const createdScheduleIds: string[] = [];
const evidence = 'docs/work/FW-027-schedules/evidence';

test.afterAll(async () => {
  if (!createdSiteIds.length && !createdScheduleIds.length) return;
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  databaseUrl.pathname = `/floorwalk_e2e_${configuredSlot}`;
  const pool = createPool(databaseUrl.toString());
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM floorwalk.site_schedules WHERE site_id = ANY($1::uuid[])',
      [createdSiteIds],
    );
    await client.query(
      'DELETE FROM floorwalk.schedules WHERE id = ANY($1::uuid[])',
      [createdScheduleIds],
    );
    await client.query(
      'DELETE FROM floorwalk.sites WHERE id = ANY($1::uuid[])',
      [createdSiteIds],
    );
    const remaining = await client.query<{ count: number }>(
      `SELECT (
         (SELECT count(*) FROM floorwalk.sites WHERE id = ANY($1::uuid[])) +
         (SELECT count(*) FROM floorwalk.schedules WHERE id = ANY($2::uuid[])) +
         (SELECT count(*) FROM floorwalk.site_schedule_skips WHERE site_id = ANY($1::uuid[]))
       )::int AS count`,
      [createdSiteIds, createdScheduleIds],
    );
    expect(remaining.rows[0].count).toBe(0);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
});

test('FW-027 AC-06 跨夜方案、两店选用和单店跳过在刷新后保留', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('登录名').fill('hq@northbean.example');
  await page.getByLabel('密码').fill('northbean-demo');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: /总部看板/ })).toBeVisible();

  const templatesResponse = await page.request.get(
    `${apiBase}/admin/templates`,
  );
  expect(templatesResponse.ok()).toBe(true);
  const [template] = (await templatesResponse.json()) as AdminTemplatesResponse;
  expect(template).toBeTruthy();
  const suffix = Date.now();
  const siteCodes = [`FW027-A-${suffix}`, `FW027-B-${suffix}`];
  for (const [index, code] of siteCodes.entries()) {
    const response = await page.request.post(`${apiBase}/admin/sites`, {
      data: { code, name: `日程界面测试店 ${index + 1}` },
    });
    expect(response.status()).toBe(201);
    createdSiteIds.push(((await response.json()) as Site).id);
  }

  const navigation = page.getByLabel('控制台导航');
  await navigation
    .getByRole('button', { name: '日程方案', exact: true })
    .click();
  await page.getByRole('button', { name: '新建方案', exact: true }).click();
  const enabledDays = page.getByRole('checkbox', {
    name: /^周[一二三四五六日]启用$/,
  });
  await expect(enabledDays).toHaveCount(7);
  for (const checkbox of await enabledDays.all())
    await expect(checkbox).toBeChecked();
  const scheduleName = `跨夜巡检-${suffix}`;
  await page.getByLabel('方案名称', { exact: true }).fill(scheduleName);
  const monday = page.getByRole('group', { name: '周一', exact: true });
  await monday.getByRole('button', { name: '添加任务', exact: true }).click();
  await page
    .getByLabel('周一任务 1模板', { exact: true })
    .selectOption(template.id);
  await page.getByLabel('周一任务 1开始时刻', { exact: true }).fill('23:30');
  await page.getByLabel('周一任务 1结束时刻', { exact: true }).fill('01:15');
  await expect(monday).toContainText('次日结束');
  const createdResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/admin/schedules') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '创建方案', exact: true }).click();
  const created = await createdResponse;
  const schedule = (await created.json()) as AdminSchedule;
  if (schedule.id) createdScheduleIds.push(schedule.id);
  expect(created.status()).toBe(201);
  expect(schedule.days.find((day) => day.weekday === 1)?.tasks).toEqual([
    { templateId: template.id, startsAt: '23:30', endsAt: '01:15' },
  ]);
  await expect(page.getByRole('status')).toContainText('日程方案已保存。');

  await navigation
    .getByRole('button', { name: '门店日程安排', exact: true })
    .click();
  for (const code of siteCodes)
    await page.getByLabel(`选择门店 ${code}`, { exact: true }).check();
  await page
    .getByRole('combobox', { name: '选用方案', exact: true })
    .selectOption(schedule.id);
  await page.getByRole('button', { name: '应用方案', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(
    '已为 2 家门店更新方案。',
  );
  for (const code of siteCodes)
    await expect(page.getByRole('row').filter({ hasText: code })).toContainText(
      scheduleName,
    );

  await page.getByLabel(`选择门店 ${siteCodes[1]}`, { exact: true }).uncheck();
  await page.getByLabel('跳过开始日期', { exact: true }).fill('2026-11-16');
  await page.getByLabel('跳过结束日期', { exact: true }).fill('2026-11-18');
  await page.getByLabel('跳过备注（可选）', { exact: true }).fill('门店装修');
  await page.getByRole('button', { name: '添加跳过日期', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(
    '已为 1 家门店添加跳过日期。',
  );

  await page.reload();
  await navigation
    .getByRole('button', { name: '日程方案', exact: true })
    .click();
  await page.getByRole('button').filter({ hasText: scheduleName }).click();
  await expect(page.getByLabel('方案名称', { exact: true })).toHaveValue(
    scheduleName,
  );
  await expect(page.getByLabel('周一任务 1模板', { exact: true })).toHaveValue(
    template.id,
  );
  await expect(
    page.getByLabel('周一任务 1开始时刻', { exact: true }),
  ).toHaveValue('23:30');
  await expect(
    page.getByLabel('周一任务 1结束时刻', { exact: true }),
  ).toHaveValue('01:15');
  await expect(monday).toContainText('次日结束');
  await page.screenshot({ path: `${evidence}/schedule.png`, fullPage: true });

  await navigation
    .getByRole('button', { name: '门店日程安排', exact: true })
    .click();
  const first = page.getByRole('row').filter({ hasText: siteCodes[0] });
  const second = page.getByRole('row').filter({ hasText: siteCodes[1] });
  for (const row of [first, second])
    await expect(row).toContainText(scheduleName);
  await expect(first).toContainText('2026-11-16 至 2026-11-18');
  await expect(first).toContainText('门店装修');
  await expect(second).toContainText('无跳过区间');
  await page.screenshot({
    path: `${evidence}/site-schedules.png`,
    fullPage: true,
  });
});
