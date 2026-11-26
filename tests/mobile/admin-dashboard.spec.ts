import { expect, test } from '@playwright/test';
import type { DashboardPeriodResponse } from '@libs/shared';
import { apiBase } from './admin-fixtures';
import {
  createDashboardFixture,
  dashboardPassword,
} from './dashboard-fixtures';

test('FW-034 AC-04 周月指标与门店、店长和日期趋势', async ({ page }) => {
  const dashboard = await createDashboardFixture(page, apiBase);
  try {
    const weekResponse = await page.request.get(`${apiBase}/dashboard/period`, {
      params: { period: 'week' },
    });
    const monthResponse = await page.request.get(
      `${apiBase}/dashboard/period`,
      {
        params: { period: 'month' },
      },
    );
    expect(weekResponse.status()).toBe(200);
    expect(monthResponse.status()).toBe(200);
    const week = (await weekResponse.json()) as DashboardPeriodResponse;
    const month = (await monthResponse.json()) as DashboardPeriodResponse;
    const oldDate = new Date(`${[week.from, month.from].sort()[0]}T00:00:00Z`);
    oldDate.setUTCDate(oldDate.getUTCDate() - 1);
    await dashboard.addTask({
      date: oldDate.toISOString().slice(0, 10),
      due: oldDate,
      score: 76,
      results: ['pass'],
    });
    await dashboard.open();
    const todayTab = page.getByRole('tab', { name: '今日视图' });
    await todayTab.click();
    await expect(todayTab).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('admin-dashboard-entry').click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/?$/);
    await expect(page.getByRole('heading', { name: '总部看板' })).toBeVisible();
    await expect(page.getByText('本周暂无数据')).toBeVisible();
    await expect(page.getByLabel('每日完成率与平均分折线图')).toHaveCount(0);
    const oldSite = page.getByTestId(`site-${dashboard.siteIds[0]}`);
    await expect(oldSite).toContainText('最近分数 76 分');
    await expect(oldSite).toContainText('最近判定 已通过');

    const completed = await dashboard.addTask({
      score: 80,
      results: ['pass', 'pass', 'fail'],
      due: new Date(Date.now() - 5 * 60_000),
    });
    await dashboard.pool.query(
      `UPDATE floorwalk.inspection_items SET uploaded_at = $2, upload_version = 2
       WHERE inspection_id = $1 AND position = 1`,
      [completed.inspectionId, new Date()],
    );
    const second = await dashboard.addTask({
      site: 1,
      score: 40,
      results: ['fail'],
    });
    const secondManagerResponse = await page.request.post(
      `${apiBase}/admin/users`,
      {
        data: {
          loginName: `second-${dashboard.email}`,
          displayName: '第二店长',
          role: 'store_manager',
          siteId: dashboard.siteIds[1],
          password: dashboardPassword,
        },
      },
    );
    expect(secondManagerResponse.status()).toBe(201);
    const secondManagerId = (await secondManagerResponse.json()).id as string;
    await dashboard.pool.query(
      'UPDATE floorwalk.inspection_items SET uploaded_by_id = $2 WHERE inspection_id = $1',
      [second.inspectionId, secondManagerId],
    );
    await dashboard.addTask({ due: new Date(Date.now() - 5 * 60_000) });
    await dashboard.addTask();
    const outsideWeek = month.from < week.from ? month.from : month.to;
    expect(outsideWeek < week.from || outsideWeek > week.to).toBe(true);
    await dashboard.addTask({
      date: outsideWeek,
      due: new Date(`${outsideWeek}T23:59:00+08:00`),
    });

    await page.getByRole('button', { name: '刷新', exact: true }).click();
    const summary = page.getByTestId('admin-dashboard-summary');
    await expect(summary).toContainText('完成率');
    await expect(summary).toContainText('50%');
    await expect(summary).toContainText('逾期任务');
    await expect(summary).toContainText('1');
    await expect(summary).toContainText('自检准确率');
    await expect(summary).toContainText('平均分');
    await expect(summary).toContainText('60 分');
    await expect(page.getByTestId('admin-dashboard-sites')).toContainText(
      '统计门店1',
    );
    await expect(page.getByTestId('admin-dashboard-sites')).toContainText(
      '统计门店2',
    );
    await page.getByRole('button', { name: '本月', exact: true }).click();
    await expect(summary).toContainText('完成率');
    await expect(summary).toContainText('40%');
    await expect(summary).toContainText('本月应完成 5 项');
    await expect(summary).toContainText('自检准确率');
    await expect(summary).toContainText('50%');
    await expect(summary).toContainText('平均分');
    await expect(summary).toContainText('60 分');

    await page.getByRole('button', { name: '店长', exact: true }).click();
    const firstManager = page.getByTestId(`manager-${dashboard.managerId}`);
    await expect(firstManager).toContainText('统计店长');
    await expect(firstManager).toContainText('提交条目数 3');
    await expect(firstManager).toContainText('通过率 66.7%');
    await expect(firstManager).toContainText('自检准确率 50%');
    const secondManager = page.getByTestId(`manager-${secondManagerId}`);
    await expect(secondManager).toContainText('第二店长');
    await expect(secondManager).toContainText('提交条目数 1');
    await expect(secondManager).toContainText('通过率 0%');
    await expect(secondManager).toContainText('自检准确率 —');

    await page.getByRole('button', { name: '日期趋势', exact: true }).click();
    await expect(page.getByLabel('每日完成率与平均分折线图')).toBeVisible();
    await expect(page.getByTestId(`date-${dashboard.today}`)).toContainText(
      '已完成/应完成 2/4',
    );
    await expect(page.getByTestId(`date-${outsideWeek}`)).toContainText(
      '已完成/应完成 0/1',
    );
    await page.getByRole('button', { name: '门店', exact: true }).click();
    await expect(page.getByTestId('admin-dashboard-sites')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/today\/?$/);
  } finally {
    await dashboard.cleanup();
  }
});

test('FW-034 AC-04 慢请求完成后仍能显示看板', async ({ page }) => {
  test.setTimeout(60_000);
  const dashboard = await createDashboardFixture(page, apiBase);
  try {
    await dashboard.addTask();
    await dashboard.open();
    const todayTab = page.getByRole('tab', { name: '今日视图' });
    await todayTab.click();
    await expect(todayTab).toHaveAttribute('aria-selected', 'true');
    let delayedRequests = 0;
    await page.route(
      (url) => url.pathname.endsWith('/api/dashboard/period'),
      async (route) => {
        delayedRequests += 1;
        await new Promise((resolve) => setTimeout(resolve, 11_000));
        await route.continue().catch(() => undefined);
      },
    );
    await page.getByTestId('admin-dashboard-entry').click();
    await expect(page).toHaveURL(/\/admin\/dashboard\/?$/);
    await expect(page.getByTestId('admin-dashboard-summary')).toContainText(
      '本周应完成 1 项',
      { timeout: 25_000 },
    );
    expect(delayedRequests).toBeGreaterThan(0);
  } finally {
    await dashboard.cleanup();
  }
});
