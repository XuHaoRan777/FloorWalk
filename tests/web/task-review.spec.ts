import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { expect, request as playwrightRequest, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { createPool } from '../../apps/api/src/db/client.js';
import { seedPhoto } from '../../apps/api/src/db/seed-data.js';
import { LocalStorageDriver } from '../../apps/api/src/storage/local.js';

const configuredSlot = Number(process.env.FW_SLOT);
const apiBase = `http://127.0.0.1:${3100 + configuredSlot * 10}/api`;
const adminPassword = 'northbean-demo';
const managerInitialPassword = 'initial-password';
const managerPassword = 'changed-password';

async function loginAdmin(page: Page) {
  await page.goto('/');
  await page.getByLabel('登录名').fill('hq@northbean.example');
  await page.getByLabel('密码').fill(adminPassword);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: /总部看板/ })).toBeVisible();
}

test('FW-031 AC-01～04 假模型失败转人工、打回重传、判定与改判', async ({
  page,
}) => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  databaseUrl.pathname = `/floorwalk_e2e_${configuredSlot}`;
  const pool = createPool(databaseUrl.toString());
  let managerContext: APIRequestContext | undefined;
  let siteId: string | undefined;
  let templateId: string | undefined;
  let standardId: string | undefined;
  let managerId: string | undefined;
  let scheduleId: string | undefined;
  let taskId: string | undefined;

  try {
    await loginAdmin(page);
    const pendingCount = page.getByRole('button', { name: /^待我处理/ });
    await expect(pendingCount).toHaveText(/^待我处理 \d+$/);
    const initialCount = Number(
      (await pendingCount.innerText()).match(/\d+/)![0],
    );
    const suffix = randomUUID();
    const siteResponse = await page.request.post(`${apiBase}/admin/sites`, {
      data: {
        code: `FW031-${suffix}`,
        name: `FW-031 测试门店 ${suffix.slice(0, 8)}`,
      },
    });
    expect(siteResponse.status()).toBe(201);
    const site = (await siteResponse.json()) as { id: string; name: string };
    siteId = site.id;

    const standardResponse = await page.request.post(
      `${apiBase}/admin/ai-standards`,
      {
        data: {
          name: `FW-031 失败模型标准 ${suffix}`,
          prompt: 'FW-031 fake model failure',
        },
      },
    );
    expect(standardResponse.status()).toBe(201);
    standardId = ((await standardResponse.json()) as { id: string }).id;

    const templateResponse = await page.request.post(
      `${apiBase}/admin/templates`,
      {
        data: {
          name: `FW-031 测试模板 ${suffix}`,
          aiEnabled: true,
          aiStandardId: standardId,
          items: [
            {
              title: '检查项一',
              minPhotoCount: 1,
              acceptanceCriteria: '确认现场情况。',
              critical: false,
            },
            {
              title: '检查项二',
              minPhotoCount: 0,
              acceptanceCriteria: '确认记录准确。',
              critical: false,
            },
          ],
        },
      },
    );
    expect(templateResponse.status()).toBe(201);
    templateId = ((await templateResponse.json()) as { id: string }).id;

    const userResponse = await page.request.post(`${apiBase}/admin/users`, {
      data: {
        loginName: `fw031-${suffix}@example.test`,
        displayName: 'FW-031 测试店长',
        role: 'store_manager',
        siteId,
        password: managerInitialPassword,
      },
    });
    expect(userResponse.status()).toBe(201);
    managerId = ((await userResponse.json()) as { id: string }).id;

    const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekday =
      weekdayNames.indexOf(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Shanghai',
          weekday: 'short',
        }).format(new Date()),
      ) + 1;
    const taskDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const days = Array.from({ length: 7 }, (_, index) => ({
      weekday: index + 1,
      enabled: index + 1 === weekday,
      tasks:
        index + 1 === weekday
          ? [{ templateId, startsAt: '00:00', endsAt: '23:59' }]
          : [],
    }));
    const scheduleResponse = await page.request.post(
      `${apiBase}/admin/schedules`,
      { data: { name: `FW-031 测试日程 ${suffix}`, days } },
    );
    expect(scheduleResponse.status()).toBe(201);
    scheduleId = ((await scheduleResponse.json()) as { id: string }).id;
    const assignmentResponse = await page.request.put(
      `${apiBase}/admin/site-schedules`,
      { data: { siteIds: [siteId], scheduleId } },
    );
    expect(assignmentResponse.status()).toBe(200);

    const task = await pool.query<{ id: string }>(
      `SELECT id FROM floorwalk.inspection_tasks
       WHERE site_id = $1 AND template_id = $2 AND task_date = $3::date
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [siteId, templateId, taskDate],
    );
    taskId = task.rows[0]?.id;
    expect(taskId).toBeTruthy();
    if (!taskId) throw new Error('当天日程没有生成巡检任务。');

    managerContext = await playwrightRequest.newContext();
    const loginResponse = await managerContext.post(`${apiBase}/auth/session`, {
      data: {
        loginName: `fw031-${suffix}@example.test`,
        password: managerInitialPassword,
      },
    });
    expect(loginResponse.status()).toBe(201);
    const passwordChange = await managerContext.post(`${apiBase}/me/password`, {
      data: {
        currentPassword: managerInitialPassword,
        newPassword: managerPassword,
      },
    });
    expect(passwordChange.status()).toBe(204);
    const upload = async (position: number, note: string) =>
      managerContext!.post(
        `${apiBase}/tasks/${taskId}/items/${position}/uploads`,
        {
          multipart: {
            selfAssessment: 'pass',
            note,
            ...(position === 1
              ? {
                  files: {
                    name: '现场.jpg',
                    mimeType: 'image/jpeg',
                    buffer: seedPhoto,
                  },
                }
              : {}),
          },
        },
      );

    expect((await upload(1, '首轮现场检查。')).status()).toBe(201);
    expect((await upload(2, '记录另一项检查结果。')).status()).toBe(201);
    await expect
      .poll(
        async () => {
          const jobs = await pool.query(
            `SELECT job.status, job.attempt_count AS attempts
             FROM floorwalk.ai_review_jobs job
             JOIN floorwalk.inspection_items item ON item.id = job.inspection_item_id
             JOIN floorwalk.inspections inspection ON inspection.id = item.inspection_id
             WHERE inspection.task_id = $1 ORDER BY item.position`,
            [taskId],
          );
          return jobs.rows;
        },
        { timeout: 20_000 },
      )
      .toEqual([
        { status: 'manual', attempts: 4 },
        { status: 'manual', attempts: 4 },
      ]);
    await expect(pendingCount).toHaveText(`待我处理 ${initialCount + 1}`, {
      timeout: 15_000,
    });

    await page
      .getByLabel('控制台导航')
      .getByRole('button', { name: '审核队列', exact: true })
      .click();
    const manualQueue = page.getByRole('region', {
      name: '待人工',
      exact: true,
    });
    const taskRow = manualQueue
      .getByRole('button')
      .filter({ hasText: site.name });
    await expect(taskRow).toBeVisible();
    await expect(taskRow).toContainText('FW-031 测试模板');
    await expect(taskRow).toContainText('提交于');
    await expect(taskRow).toContainText('AI 调用失败，请人工审核。');
    await taskRow.click();
    await expect(page.getByRole('heading', { name: site.name })).toBeVisible();
    const scoreRing = page.locator('.fw-review-ring');
    await expect(scoreRing).toBeVisible();
    await expect(scoreRing).toHaveAttribute('aria-label', '审核评分—');
    await expect(scoreRing).not.toHaveClass(/fw-review-ring--playing/);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      const mobileHeader = await page
        .locator('.fw-review-heading')
        .evaluate((heading) => {
          const identity = heading.querySelector(
            '.fw-review-heading__identity',
          )!;
          const summary = heading.querySelector('.fw-review-heading__summary')!;
          const ring = heading.querySelector('.fw-review-ring')!;
          return {
            documentWidth:
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
            identityBottom: identity.getBoundingClientRect().bottom,
            summaryTop: summary.getBoundingClientRect().top,
            summaryRight: summary.getBoundingClientRect().right,
            controlsRight: summary
              .querySelector('.fw-review-heading__controls')!
              .getBoundingClientRect().right,
            ringWidth: ring.getBoundingClientRect().width,
            ringLeft: ring.getBoundingClientRect().left,
            ringRight: ring.getBoundingClientRect().right,
            overflowingElements: Array.from(
              document.querySelectorAll<HTMLElement>('body *'),
            )
              .map((element) => ({
                element,
                rect: element.getBoundingClientRect(),
              }))
              .filter(
                ({ element, rect }) =>
                  rect.width > 0 &&
                  (rect.right > document.documentElement.clientWidth + 1 ||
                    element.scrollWidth > element.clientWidth + 1),
              )
              .slice(0, 12)
              .map(({ element, rect }) => ({
                tag: element.tagName,
                className: element.className,
                right: Math.round(rect.right),
                width: Math.round(rect.width),
                clientWidth: element.clientWidth,
                scrollWidth: element.scrollWidth,
              })),
          };
        });
      expect(
        mobileHeader.documentWidth,
        JSON.stringify(mobileHeader.overflowingElements),
      ).toBeLessThanOrEqual(0);
      expect(mobileHeader.identityBottom).toBeLessThanOrEqual(
        mobileHeader.summaryTop,
      );
      expect(mobileHeader.ringWidth).toBe(144);
      expect(mobileHeader.ringRight).toBeLessThanOrEqual(
        mobileHeader.summaryRight,
      );
      expect(mobileHeader.controlsRight).toBeLessThanOrEqual(
        mobileHeader.ringLeft,
      );
      await expect(
        page.getByRole('button', { name: /待我处理/ }),
      ).toBeVisible();
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    const firstItem = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: /检查项一/ }) });
    await expect(firstItem).toContainText('FW-031 测试店长');
    await expect(firstItem).toContainText(/上传于 \d{2}:\d{2}/);
    await expect(firstItem).toContainText('AI 理由：AI 调用失败，请人工审核。');
    await expect(
      firstItem.getByRole('img', { name: '检查项现场照片' }),
    ).toHaveJSProperty('naturalWidth', 1);
    const firstItemId = (
      await pool.query<{ id: string }>(
        `SELECT item.id FROM floorwalk.inspection_items item
       JOIN floorwalk.inspections inspection ON inspection.id = item.inspection_id
       WHERE inspection.task_id = $1 AND item.position = 1`,
        [taskId],
      )
    ).rows[0].id;
    const firstRework = page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(`/api/tasks/${taskId}/items/${firstItemId}/decision`) &&
        response.request().method() === 'POST',
    );
    await firstItem.getByRole('button', { name: '打回' }).click();
    await expect(
      firstItem.getByRole('button', { name: '确认打回' }),
    ).toBeDisabled();
    await firstItem.getByLabel('打回理由').fill('请补充现场检查的具体说明。');
    await firstItem.getByRole('button', { name: '确认打回' }).click();
    expect((await firstRework).status()).toBe(201);
    await expect(firstItem).toContainText(
      '打回理由：请补充现场检查的具体说明。',
    );
    await page.reload();
    await page
      .getByLabel('控制台导航')
      .getByRole('button', { name: '审核队列', exact: true })
      .click();
    await page.getByRole('button').filter({ hasText: site.name }).click();
    await expect(firstItem).toContainText(
      '打回理由：请补充现场检查的具体说明。',
    );

    expect((await upload(1, '按要求补充现场说明。')).status()).toBe(201);
    await page.getByRole('button', { name: '刷新任务' }).click();
    await expect(firstItem).toContainText('FW-031 测试店长');
    await firstItem.getByRole('button', { name: '通过' }).click();
    await expect(scoreRing).not.toHaveClass(/fw-review-ring--playing/);
    const secondItem = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: /检查项二/ }) });
    await pool.query(
      `UPDATE floorwalk.inspection_tasks
       SET starts_at = now() - interval '3 hours',
         due_at = now() - interval '1 minute' WHERE id = $1`,
      [taskId],
    );
    await secondItem.getByRole('button', { name: '通过' }).click();
    const summary = page.locator('.fw-page-heading').last();
    await expect(summary).toContainText('通过');
    await expect(scoreRing).toHaveAttribute('aria-label', '审核评分100 分');
    await expect(scoreRing).toHaveClass(/fw-review-ring--playing/);
    await expect(scoreRing.locator('.fw-review-ring__content')).toHaveText(
      '100分',
    );
    await expect(scoreRing.locator('.fw-review-ring__arc')).toHaveCount(2);
    await expect(scoreRing.locator('.fw-review-ring__arc').first()).toHaveCSS(
      'stroke-linecap',
      'round',
    );
    await expect(
      scoreRing.locator('.fw-review-ring__badge circle').first(),
    ).toHaveCSS('stroke-width', '3px');
    await expect(scoreRing.locator('.fw-review-ring__burst')).toHaveCount(1);
    await expect(pendingCount).toHaveText(`待我处理 ${initialCount}`);
    await page.getByRole('button', { name: '返回队列' }).click();
    await expect(taskRow).toHaveCount(0);
    const decidedRow = page
      .getByRole('region', { name: '今天已判定', exact: true })
      .getByRole('button')
      .filter({ hasText: site.name });
    await expect(decidedRow).toContainText('100 分');
    await decidedRow.click();
    await expect(scoreRing).toHaveAttribute('aria-label', '审核评分100 分');
    await expect(scoreRing).not.toHaveClass(/fw-review-ring--playing/);
    await pool.query(
      `UPDATE floorwalk.inspection_tasks
       SET due_at = now() - interval '2 hours' WHERE id = $1`,
      [taskId],
    );
    await secondItem.getByRole('button', { name: '不合格' }).click();
    await expect(summary).toContainText('不合格');
    await expect(scoreRing).toHaveAttribute('aria-label', '审核评分50 分');
    await expect(scoreRing).toHaveClass(/fw-review-ring--playing/);
    await expect(
      firstItem.getByRole('button', { name: '打回' }),
    ).toBeDisabled();

    await secondItem.getByRole('button', { name: '通过' }).click();
    await expect(summary).toContainText('通过');
    await expect(scoreRing).toHaveAttribute('aria-label', '审核评分100 分');
    await expect(scoreRing).not.toHaveClass(/fw-review-ring--playing/);
    await expect(pendingCount).toHaveText(`待我处理 ${initialCount}`);
  } finally {
    if (managerContext) {
      await managerContext
        .delete(`${apiBase}/auth/session`)
        .catch(() => undefined);
      await managerContext.dispose();
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (taskId) {
        const evidence = await client.query<{ storageKey: string }>(
          `SELECT evidence.storage_key AS "storageKey" FROM floorwalk.evidence evidence
           JOIN floorwalk.inspection_items item ON item.id = evidence.inspection_item_id
           JOIN floorwalk.inspections inspection ON inspection.id = item.inspection_id
           WHERE inspection.task_id = $1`,
          [taskId],
        );
        const storage = new LocalStorageDriver(
          path.resolve(`apps/api/.e2e/slot-${configuredSlot}/storage`),
        );
        for (const row of evidence.rows) await storage.delete(row.storageKey);
        await client.query(
          `DELETE FROM floorwalk.evidence evidence
           USING floorwalk.inspection_items item, floorwalk.inspections inspection
           WHERE evidence.inspection_item_id = item.id
             AND item.inspection_id = inspection.id AND inspection.task_id = $1`,
          [taskId],
        );
        await client.query(
          `DELETE FROM floorwalk.ai_review_jobs job
           USING floorwalk.inspection_items item, floorwalk.inspections inspection
           WHERE job.inspection_item_id = item.id
             AND item.inspection_id = inspection.id AND inspection.task_id = $1`,
          [taskId],
        );
        await client.query(
          `DELETE FROM floorwalk.inspection_item_decisions decision
           USING floorwalk.inspection_items item, floorwalk.inspections inspection
           WHERE decision.inspection_item_id = item.id
             AND item.inspection_id = inspection.id AND inspection.task_id = $1`,
          [taskId],
        );
        await client.query(
          `DELETE FROM floorwalk.inspection_participants participant
           USING floorwalk.inspections inspection
           WHERE participant.inspection_id = inspection.id AND inspection.task_id = $1`,
          [taskId],
        );
        await client.query(
          `DELETE FROM floorwalk.inspection_items item
           USING floorwalk.inspections inspection
           WHERE item.inspection_id = inspection.id AND inspection.task_id = $1`,
          [taskId],
        );
        await client.query(
          'DELETE FROM floorwalk.inspections WHERE task_id = $1',
          [taskId],
        );
        await client.query(
          'DELETE FROM floorwalk.inspection_tasks WHERE id = $1',
          [taskId],
        );
      }
      if (siteId)
        await client.query(
          'DELETE FROM floorwalk.site_schedules WHERE site_id = $1',
          [siteId],
        );
      if (scheduleId)
        await client.query('DELETE FROM floorwalk.schedules WHERE id = $1', [
          scheduleId,
        ]);
      if (managerId)
        await client.query(
          'DELETE FROM floorwalk.sessions WHERE user_id = $1',
          [managerId],
        );
      if (managerId)
        await client.query('DELETE FROM floorwalk.users WHERE id = $1', [
          managerId,
        ]);
      if (templateId) {
        await client.query(
          'DELETE FROM floorwalk.template_items WHERE template_id = $1',
          [templateId],
        );
        await client.query('DELETE FROM floorwalk.templates WHERE id = $1', [
          templateId,
        ]);
      }
      if (standardId)
        await client.query(
          'DELETE FROM floorwalk.ai_review_standards WHERE id = $1',
          [standardId],
        );
      if (siteId)
        await client.query('DELETE FROM floorwalk.sites WHERE id = $1', [
          siteId,
        ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
    await page.request.delete(`${apiBase}/auth/session`).catch(() => undefined);
  }
});
