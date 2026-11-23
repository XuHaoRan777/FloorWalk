import { expect, test } from '@playwright/test';
import type {
  AdminSchedule,
  AdminSiteSchedule,
  AdminTemplatesResponse,
  Site,
} from '@libs/shared';
import {
  apiBase,
  cleanupSchedules,
  loginAdmin,
  saveAdmin,
} from './admin-fixtures';

test('AC-06 七天任务、跨夜时间窗、批量方案和跳过区间刷新保留', async ({
  page,
}) => {
  const scheduleIds: string[] = [];
  const sites: Site[] = [];
  try {
    await loginAdmin(page);
    const templatesResponse = await page.request.get(
      `${apiBase}/admin/templates`,
    );
    expect(templatesResponse.ok()).toBeTruthy();
    const [template] =
      (await templatesResponse.json()) as AdminTemplatesResponse;
    expect(template).toBeTruthy();
    const suffix = Date.now();
    for (const index of [1, 2]) {
      const response = await page.request.post(`${apiBase}/admin/sites`, {
        data: {
          code: `FW033-S-${suffix}-${index}`,
          name: `移动日程测试店${index}`,
        },
      });
      expect(response.ok()).toBeTruthy();
      sites.push((await response.json()) as Site);
    }
    await page.getByTestId('admin-entry-schedules').click();
    await page.getByRole('button', { name: '新建方案', exact: true }).click();
    await page
      .getByLabel('方案名称', { exact: true })
      .fill(`移动日程-${suffix}`);
    const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    for (const [index, label] of weekdays.entries()) {
      await page
        .getByLabel('编辑星期', { exact: true })
        .selectOption(String(index + 1));
      await page.getByRole('button', { name: '添加任务', exact: true }).click();
      await page
        .getByLabel(`${label}任务 1模板`, { exact: true })
        .selectOption(template.id);
    }
    await page.getByLabel('编辑星期', { exact: true }).selectOption('1');
    await page.getByLabel('周一任务 1开始时刻', { exact: true }).fill('23:30');
    await page.getByLabel('周一任务 1结束时刻', { exact: true }).fill('01:15');
    await expect(page.getByText('次日结束', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '添加任务', exact: true }).click();
    await page
      .getByLabel('周一任务 2模板', { exact: true })
      .selectOption(template.id);
    const created = await saveAdmin<AdminSchedule>(
      page,
      '/admin/schedules',
      'POST',
      '创建方案',
    );
    scheduleIds.push(created.id);
    expect(created.days).toHaveLength(7);
    expect(created.days[0].tasks).toEqual([
      { templateId: template.id, startsAt: '23:30', endsAt: '01:15' },
      { templateId: template.id, startsAt: '09:00', endsAt: '10:00' },
    ]);
    expect(
      created.days
        .slice(1)
        .every((day) => day.enabled && day.tasks.length === 1),
    ).toBe(true);
    const scheduleCard = page.getByTestId(`schedule-${created.id}`);
    await scheduleCard
      .getByRole('button', { name: '编辑', exact: true })
      .click();
    await page
      .getByRole('button', { name: '移除周一任务 2', exact: true })
      .click();
    await page.getByLabel('编辑星期', { exact: true }).selectOption('7');
    await page.getByText('周日启用', { exact: true }).click();
    await page
      .getByLabel('方案名称', { exact: true })
      .fill(`移动日程修改-${suffix}`);
    const updated = await saveAdmin<AdminSchedule>(
      page,
      `/admin/schedules/${created.id}`,
      'PUT',
      '保存方案',
    );
    expect(updated.days[0].tasks).toHaveLength(1);
    expect(updated.days[6].enabled).toBe(false);
    await page.reload();
    await scheduleCard
      .getByRole('button', { name: '编辑', exact: true })
      .click();
    await expect(
      page.getByLabel('周一任务 1开始时刻', { exact: true }),
    ).toHaveValue('23:30');
    await expect(
      page.getByLabel('周一任务 1结束时刻', { exact: true }),
    ).toHaveValue('01:15');
    await page.getByRole('button', { name: '取消编辑', exact: true }).click();
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await page.getByTestId('admin-entry-site-schedules').click();
    for (const site of sites)
      await page.getByText(`选择门店 ${site.code}`, { exact: true }).click();
    await page.getByLabel('选用方案', { exact: true }).selectOption(created.id);
    const assigned = await saveAdmin<AdminSiteSchedule[]>(
      page,
      '/admin/site-schedules',
      'PUT',
      '应用方案',
    );
    expect(
      assigned
        .filter((site) =>
          sites.some((createdSite) => createdSite.id === site.siteId),
        )
        .every((site) => site.scheduleId === created.id),
    ).toBe(true);
    await page.getByLabel('跳过开始日期', { exact: true }).fill('2026-11-16');
    await page.getByLabel('跳过结束日期', { exact: true }).fill('2026-11-18');
    await page.getByLabel('跳过备注（可选）', { exact: true }).fill('门店装修');
    const skipped = await saveAdmin<AdminSiteSchedule[]>(
      page,
      '/admin/site-schedules/skips',
      'POST',
      '添加跳过日期',
    );
    for (const site of sites) {
      const result = skipped.find((entry) => entry.siteId === site.id);
      expect(result?.skippedRanges).toEqual([
        expect.objectContaining({
          startsOn: '2026-11-16',
          endsOn: '2026-11-18',
          note: '门店装修',
        }),
      ]);
    }
    await page.reload();
    for (const site of sites) {
      const card = page.getByTestId(`site-schedule-${site.id}`);
      await expect(card).toContainText(updated.name);
      await expect(card).toContainText('2026-11-16 至 2026-11-18');
      await expect(card).toContainText('门店装修');
    }
  } finally {
    await cleanupSchedules(
      scheduleIds,
      sites.map((site) => site.id),
    );
  }
});
