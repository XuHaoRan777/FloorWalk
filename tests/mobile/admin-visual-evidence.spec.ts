import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { seedPhoto } from '../../apps/api/src/db/seed-data.js';
import { apiBase } from './admin-fixtures';
import {
  createDashboardFixture,
  dashboardPassword,
} from './dashboard-fixtures';
import { createReviewFixture } from './review-fixtures';

const viewport = { width: 390, height: 844 };
const evidenceDirectory = path.resolve(
  'docs/work/FW-048-mobile-admin-main-path/evidence',
);

const designPages = {
  today: path.resolve('.visual/samples/r2/B/03-admin-today.html'),
  review: path.resolve('.visual/design/pages/admin-review-queue.html'),
  reviewDetail: path.resolve('.visual/samples/r2/B/04-admin-review.html'),
  dashboard: path.resolve('.visual/design/pages/admin-dashboard.html'),
  notifications: path.resolve('.visual/design/pages/admin-notifications.html'),
  profile: path.resolve('.visual/design/pages/admin-profile.html'),
};

async function captureComparison(
  page: Page,
  reference: Page,
  comparison: Page,
  name: string,
  designFile: string,
  route: string,
  ready: () => Promise<void>,
) {
  await page.setViewportSize(viewport);
  await page.goto(route);
  await ready();
  const appImage = await page.screenshot({ type: 'png' });

  await reference.setViewportSize(viewport);
  await reference.goto(pathToFileURL(designFile).href);
  const syntheticImage = `data:image/jpeg;base64,${seedPhoto.toString('base64')}`;
  await reference
    .locator('.site-card__photo, .review-item__photo img')
    .evaluateAll((images, source) => {
      for (const image of images) (image as HTMLImageElement).src = source;
    }, syntheticImage);
  await reference.evaluate(async () => {
    await Promise.all(
      Array.from(document.images, (image) => image.decode().catch(() => undefined)),
    );
  });
  const designImage = await reference.screenshot({ type: 'png' });

  await comparison.setViewportSize({ width: 780, height: 872 });
  const designSource = designImage.toString('base64');
  const appSource = appImage.toString('base64');
  await comparison.setContent(`
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; background: #f5f5f5; color: #595959; font: 12px sans-serif; }
          main { display: grid; grid-template-columns: 390px 390px; grid-template-rows: 28px 844px; }
          header { align-items: center; display: flex; padding: 0 8px; }
          img { display: block; height: 844px; width: 390px; }
        </style>
      </head>
      <body>
        <main>
          <header>设计稿 · 图库照片以合成图替代</header>
          <header>Expo Web · 390 × 844</header>
          <img alt="设计稿 ${name}" src="data:image/png;base64,${designSource}">
          <img alt="Expo Web ${name}" src="data:image/png;base64,${appSource}">
        </main>
      </body>
    </html>
  `);
  await comparison.screenshot({
    path: path.join(evidenceDirectory, `${name}.png`),
  });
}

test('FW-048 生成六页 390×844 设计稿对照证据', async ({ page }) => {
  test.setTimeout(240_000);
  await mkdir(evidenceDirectory, { recursive: true });
  const dashboard = await createDashboardFixture(page, apiBase);
  let review:
    | Awaited<ReturnType<typeof createReviewFixture>>
    | undefined;
  const reference = await page.context().newPage();
  const comparison = await page.context().newPage();

  try {
    const criticalTask = await dashboard.addTask({
      score: 0,
      critical: true,
      results: ['fail'],
      due: new Date(Date.now() - 5 * 60_000),
    });
    const overdueTask = await dashboard.addTask({
      site: 1,
      due: new Date(Date.now() - 5 * 60_000),
    });
    const manualTask = await dashboard.addTask({
      results: ['pending'],
    });
    const fallbackTask = await dashboard.addTask({
      ai: true,
      results: ['pending'],
      job: 'manual',
    });
    const processingTask = await dashboard.addTask({
      ai: true,
      results: ['pending'],
      job: 'processing',
    });
    const finalTask = await dashboard.addTask({ site: 1 });

    await page.request.delete(`${apiBase}/auth/session`).catch(() => undefined);
    await page.goto('/');
    await page.getByLabel('登录名', { exact: true }).fill(dashboard.email);
    await page
      .getByLabel('密码', { exact: true })
      .fill(dashboardPassword);
    await page.getByTestId('login-button').click();
    await expect(
      page.getByRole('heading', { name: '今日门店', exact: true }),
    ).toBeVisible();

    review = await createReviewFixture(page.request, apiBase);
    expect((await review.upload(1, '合成测试照片的人工复核样例。')).status()).toBe(
      201,
    );
    expect((await review.upload(2, '第二项人工复核样例。')).status()).toBe(201);
    await review.waitForManual();
    const notification = await review.pool.query<{ id: string }>(
      `SELECT id FROM floorwalk.notifications
       WHERE payload_json->>'taskId' = $1
       ORDER BY created_at DESC LIMIT 1`,
      [review.taskId],
    );
    const notificationId = notification.rows[0]?.id;
    if (!notificationId) throw new Error('复核 fixture 未生成通知。');

    await captureComparison(
      page,
      reference,
      comparison,
      'AC-01-admin-today',
      designPages.today,
      '/admin/today',
      async () => {
        await expect(
          page.getByRole('heading', { name: '今日门店', exact: true }),
        ).toBeVisible();
        await expect(page.getByTestId('admin-today-summary')).toContainText(
          '预计任务',
        );
        for (const task of [
          criticalTask,
          overdueTask,
          manualTask,
          fallbackTask,
          processingTask,
          finalTask,
        ]) {
          await expect(
            page.getByTestId(`today-task-${task.taskId}`),
          ).toBeVisible();
        }
        await expect(
          page.getByTestId('admin-today-warnings').getByTestId(/^warning-/),
        ).toHaveCount(2);
        await expect(
          page.getByTestId(`pending-task-${manualTask.taskId}`),
        ).toBeVisible();
        await expect(
          page.getByTestId(`pending-task-${fallbackTask.taskId}`),
        ).toBeVisible();
        await expect(
          page.getByTestId(`pending-task-${processingTask.taskId}`),
        ).toHaveCount(0);
      },
    );
    await captureComparison(
      page,
      reference,
      comparison,
      'AC-02-admin-review-queue',
      designPages.review,
      '/admin/review',
      async () => page.getByTestId(`review-task-${review!.taskId}`).waitFor(),
    );
    await captureComparison(
      page,
      reference,
      comparison,
      'AC-03-admin-review-detail',
      designPages.reviewDetail,
      `/admin/review/${review!.taskId}?returnTo=review`,
      async () => page.getByTestId('review-summary').waitFor(),
    );
    await captureComparison(
      page,
      reference,
      comparison,
      'AC-04-admin-dashboard',
      designPages.dashboard,
      '/admin/dashboard',
      async () => page.getByTestId('admin-dashboard-summary').waitFor(),
    );
    await captureComparison(
      page,
      reference,
      comparison,
      'AC-05-admin-notifications',
      designPages.notifications,
      '/admin/notifications',
      async () => page.getByTestId(`notification-${notificationId}`).waitFor(),
    );
    await captureComparison(
      page,
      reference,
      comparison,
      'AC-06-admin-profile',
      designPages.profile,
      '/admin/profile',
      async () =>
        expect(
          page.getByRole('heading', { name: '我的', exact: true }),
        ).toBeVisible(),
    );
  } finally {
    await reference.close();
    await comparison.close();
    try {
      await review?.cleanup();
    } finally {
      await dashboard.cleanup();
    }
  }
});
