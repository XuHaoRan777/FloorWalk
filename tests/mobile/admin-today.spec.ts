import { expect, test } from '@playwright/test';
import type { AdminTodayResponse, TaskReview } from '@libs/shared';
import { apiBase } from './admin-fixtures';
import { createDashboardFixture } from './dashboard-fixtures';

test('FW-034 AC-03 今日任务、汇总、警告和人工待处理', async ({ page }) => {
  const dashboard = await createDashboardFixture(page, apiBase);
  try {
    const critical = await dashboard.addTask({
      score: 0,
      critical: true,
      results: ['fail'],
      due: new Date(Date.now() - 5 * 60_000),
    });
    const overdue = await dashboard.addTask({
      site: 1,
      due: new Date(Date.now() - 5 * 60_000),
    });
    const manual = await dashboard.addTask({ results: ['pending'] });
    const fallback = await dashboard.addTask({
      ai: true,
      results: ['pending'],
      job: 'manual',
    });
    const processing = await dashboard.addTask({
      ai: true,
      results: ['pending'],
      job: 'processing',
    });
    await dashboard.addTask({ site: 1 });
    const response = await page.request.get(`${apiBase}/dashboard/today`);
    expect(response.status()).toBe(200);
    const data = (await response.json()) as AdminTodayResponse;
    expect(data.summary).toEqual({ expected: 6, completed: 4, overdue: 1 });
    expect(
      data.tasks.find((task) => task.id === critical.taskId),
    ).toMatchObject({
      score: 0,
      criticalFailure: true,
      status: 'submitted',
    });
    await dashboard.open();
    await page.getByRole('tab', { name: '今日视图' }).click();
    await expect(
      page.getByRole('heading', { name: '今日门店', exact: true }),
    ).toBeVisible();
    const summary = page.getByTestId('admin-today-summary');
    await expect(summary).toContainText('预计任务');
    await expect(summary).toContainText('6');
    await expect(summary).toContainText('已完成');
    await expect(summary).toContainText('4');
    await expect(summary).toContainText('逾期');
    await expect(summary).toContainText('1');
    const tasks = page.getByTestId('admin-today-tasks');
    await expect(tasks.getByTestId(/^today-task-/)).toHaveCount(6);
    await expect(tasks).toContainText('统计门店1');
    await expect(tasks).toContainText('统计门店2');
    await expect(tasks).toContainText('人工模板');
    await expect(tasks).toContainText('AI模板');
    await expect(tasks).toContainText('已提交');
    await expect(tasks).toContainText('未开始');
    await expect(tasks.getByText(/\d{2}:\d{2}–\d{2}:\d{2}/)).toHaveCount(6);
    await expect(
      page.getByTestId(`today-task-${critical.taskId}`),
    ).toContainText('0 分');
    const warnings = page.getByTestId('admin-today-warnings');
    await expect(warnings.getByTestId(/^warning-/)).toHaveCount(2);
    await expect(
      warnings.getByTestId(`warning-${critical.taskId}`),
    ).toContainText('严重项不合格');
    await expect(
      warnings.getByTestId(`warning-${overdue.taskId}`),
    ).toContainText('任务逾期');
    const pending = page.getByTestId('admin-today-pending');
    await expect(pending.getByTestId(/^pending-task-/)).toHaveCount(2);
    await expect(
      pending.getByTestId(`pending-task-${manual.taskId}`),
    ).toContainText('人工模板');
    await expect(
      pending.getByTestId(`pending-task-${fallback.taskId}`),
    ).toContainText('AI模板');
    await expect(
      pending.getByTestId(`pending-task-${processing.taskId}`),
    ).toHaveCount(0);
    const queueResponse = await page.request.get(`${apiBase}/review/tasks`);
    expect(queueResponse.status()).toBe(200);
    const queue = (await queueResponse.json()) as TaskReview[];
    expect(queue.map((task) => task.id)).toEqual(
      expect.arrayContaining([manual.taskId, fallback.taskId]),
    );
    expect(queue.map((task) => task.id)).not.toContain(processing.taskId);
    await expect(page.getByText('AI 审核中', { exact: true })).toHaveCount(0);
    await pending
      .getByTestId(`pending-task-${manual.taskId}`)
      .getByRole('link', { name: '处理任务', exact: true })
      .click();
    await expect(
      page.getByTestId('review-summary'),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '人工模板', exact: true }),
    ).toBeVisible();
    expect(page.url()).toContain(`/admin/review/${manual.taskId}`);
  } finally {
    await dashboard.cleanup();
  }
});
