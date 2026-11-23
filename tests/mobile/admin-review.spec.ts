import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import type { TaskReview } from '@libs/shared';
import { apiBase, loginAdmin } from './admin-fixtures';
import { createReviewFixture } from './review-fixtures';

async function decide(
  page: Page,
  taskId: string,
  item: Locator,
  button: string,
) {
  const response = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/tasks/${taskId}/items/`) &&
      response.url().endsWith('/decision') &&
      response.request().method() === 'POST',
  );
  await item.getByRole('button', { name: button, exact: true }).click();
  expect((await response).status()).toBe(201);
}

test('FW-034 AC-01、AC-02 审核队列、失败转人工、打回重传与改判', async ({
  page,
}) => {
  await loginAdmin(page);
  let fixture: Awaited<ReturnType<typeof createReviewFixture>> | undefined;
  try {
    fixture = await createReviewFixture(page.request, apiBase);
    const { taskId, site } = fixture;
    expect((await fixture.upload(1, '首轮现场检查。')).status()).toBe(201);
    expect((await fixture.upload(2, '记录另一项检查结果。')).status()).toBe(
      201,
    );
    await fixture.waitForManual();
    await page.getByRole('tab', { name: '审核队列' }).click();
    await expect(
      page.getByRole('heading', { name: '审核队列', exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/^待人工 · \d+ 个任务$/)).toBeVisible();
    await expect(page.getByText('今天已判定', { exact: true })).toBeVisible();
    const taskCard = page.getByTestId(`review-task-${taskId}`);
    await expect(taskCard).toHaveCount(1);
    await expect(taskCard).toContainText(site.name);
    await expect(taskCard).toContainText('FW-034 测试模板');
    await expect(taskCard).toContainText(/提交于 \d{2}:\d{2}/);
    await expect(taskCard).toContainText('AI 调用失败，请人工审核。');
    await taskCard
      .getByRole('button', { name: '查看任务', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: '任务审核', exact: true }),
    ).toBeVisible();
    const firstItem = page.getByTestId('review-item-1');
    const secondItem = page.getByTestId('review-item-2');
    const summary = page.getByTestId('review-summary');
    await expect(firstItem).toContainText('FW-034 测试店长');
    await expect(firstItem).toContainText(/上传于 \d{2}:\d{2}/);
    await expect(firstItem).toContainText('AI 理由：AI 调用失败，请人工审核。');
    await expect(firstItem.locator('img')).toHaveJSProperty('naturalWidth', 1);
    await firstItem.getByRole('button', { name: '打回', exact: true }).click();
    await expect(
      firstItem.getByRole('button', { name: '确认打回', exact: true }),
    ).toBeDisabled();
    await firstItem.getByLabel('打回理由', { exact: true }).fill('   ');
    await expect(
      firstItem.getByRole('button', { name: '确认打回', exact: true }),
    ).toBeDisabled();
    await firstItem
      .getByLabel('打回理由', { exact: true })
      .fill('请补充现场检查的具体说明。');
    await decide(page, taskId, firstItem, '确认打回');
    await expect(firstItem).toContainText(
      '打回理由：请补充现场检查的具体说明。',
    );
    await page.reload();
    await expect(firstItem).toContainText(
      '打回理由：请补充现场检查的具体说明。',
    );
    expect((await fixture.upload(1, '按要求补充现场说明。')).status()).toBe(
      201,
    );
    await fixture.waitForManual();
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await expect(firstItem).toContainText('备注：按要求补充现场说明。');
    await decide(page, taskId, firstItem, '通过');
    await fixture.expireWindow();
    await decide(page, taskId, secondItem, '通过');
    await expect(summary).toContainText('100 分');
    await expect(summary).toContainText('通过');
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await expect(taskCard).toHaveCount(1);
    await expect(taskCard).toContainText('100 分');
    await expect(taskCard).toContainText(/判定于 \d{2}:\d{2}/);
    await taskCard
      .getByRole('button', { name: '查看任务', exact: true })
      .click();
    await decide(page, taskId, secondItem, '不合格');
    await expect(summary).toContainText('50 分');
    await expect(summary).toContainText('不合格');
    await expect(
      firstItem.getByRole('button', { name: '打回', exact: true }),
    ).toBeDisabled();
    await expect(firstItem).toContainText('已过打回时间，仅可判通过或不合格。');
    await decide(page, taskId, secondItem, '通过');
    await expect(summary).toContainText('100 分');
    await expect(summary).toContainText('通过');
    const saved = await page.request.get(`${apiBase}/tasks/${taskId}/review`);
    expect(saved.status()).toBe(200);
    const task = (await saved.json()) as TaskReview;
    expect(task.score).toBe(100);
    expect(task.items.map((item) => item.result)).toEqual(['pass', 'pass']);
  } finally {
    await fixture?.cleanup();
    await page.request.delete(`${apiBase}/auth/session`).catch(() => undefined);
  }
});
