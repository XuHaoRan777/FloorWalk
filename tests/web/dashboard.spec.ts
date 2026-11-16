import { randomUUID } from 'node:crypto';
import { expect, test as base, type Page } from '@playwright/test';
import type { AdminTodayResponse, DashboardPeriodResponse } from '@libs/shared';
import { createPool } from '../../apps/api/src/db/client.js';

const slot = Number(process.env.FW_SLOT);
const apiBase = `http://127.0.0.1:${3100 + slot * 10}/api`;
const password = 'fw032-test-password';

const test = base.extend<{
  dashboard: Awaited<ReturnType<typeof createFixture>>;
}>({
  dashboard: async ({ page }, use) => {
    const fixture = await createFixture(page);
    try {
      await use(fixture);
    } finally {
      await fixture.cleanup();
    }
  },
});

async function createFixture(page: Page) {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  databaseUrl.pathname = `/floorwalk_e2e_${slot}`;
  const pool = createPool(databaseUrl.toString());
  const email = `fw032-${randomUUID()}@example.test`;
  const managerLogin = `manager-${email}`;
  let orgId: string | undefined;
  const cleanup = async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM floorwalk.inspection_items WHERE inspection_id IN
         (SELECT inspection.id FROM floorwalk.inspections inspection
          JOIN floorwalk.sites site ON site.id = inspection.site_id WHERE site.org_id = $1)`,
        [orgId],
      );
      await client.query(
        `DELETE FROM floorwalk.inspections WHERE site_id IN
         (SELECT id FROM floorwalk.sites WHERE org_id = $1)`,
        [orgId],
      );
      await client.query(
        'DELETE FROM floorwalk.inspection_tasks WHERE org_id = $1',
        [orgId],
      );
      await client.query('DELETE FROM floorwalk.users WHERE org_id = $1', [
        orgId,
      ]);
      await client.query('DELETE FROM floorwalk.templates WHERE org_id = $1', [
        orgId,
      ]);
      await client.query(
        'DELETE FROM floorwalk.ai_review_standards WHERE org_id = $1',
        [orgId],
      );
      await client.query('DELETE FROM floorwalk.sites WHERE org_id = $1', [
        orgId,
      ]);
      await client.query('DELETE FROM floorwalk.organizations WHERE id = $1', [
        orgId,
      ]);
      await client.query(
        'DELETE FROM floorwalk.email_verifications WHERE email = $1',
        [email],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  };
  try {
    expect(
      (
        await page.request.post(`${apiBase}/auth/registration-code`, {
          data: { email },
        })
      ).status(),
    ).toBe(201);
    const mailbox = await page.request.get(`${apiBase}/testing/mailbox`, {
      params: { recipient: email },
    });
    expect(mailbox.status()).toBe(200);
    const registration = await page.request.post(`${apiBase}/orgs`, {
      data: {
        orgName: 'FW-032 统计商家',
        adminName: '统计管理员',
        email,
        password,
        verificationCode: (await mailbox.json()).code,
      },
    });
    expect(registration.status()).toBe(201);
    orgId = (await registration.json()).org.id as string;
    const siteIds = [randomUUID(), randomUUID()];
    for (const [index, id] of siteIds.entries()) {
      await pool.query(
        'INSERT INTO floorwalk.sites (id, org_id, code, name) VALUES ($1, $2, $3, $4)',
        [id, orgId, `STAT-${index + 1}`, `统计门店${index + 1}`],
      );
    }
    const managerResponse = await page.request.post(`${apiBase}/admin/users`, {
      data: {
        loginName: managerLogin,
        displayName: '统计店长',
        role: 'store_manager',
        siteId: siteIds[0],
        password,
      },
    });
    expect(managerResponse.status()).toBe(201);
    const managerId = (await managerResponse.json()).id as string;
    const standardId = randomUUID();
    await pool.query(
      'INSERT INTO floorwalk.ai_review_standards (id, org_id, name, prompt) VALUES ($1, $2, $3, $4)',
      [standardId, orgId, '测试标准', '测试用标准'],
    );
    const templateIds = [randomUUID(), randomUUID()];
    for (const [index, id] of templateIds.entries()) {
      await pool.query(
        'INSERT INTO floorwalk.templates (id, org_id, name, ai_enabled, ai_standard_id) VALUES ($1, $2, $3, $4, $5)',
        [
          id,
          orgId,
          index === 0 ? '人工模板' : 'AI模板',
          index === 1,
          index === 1 ? standardId : null,
        ],
      );
    }
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    let position = 0;
    const addTask = async (
      input: {
        site?: number;
        ai?: boolean;
        date?: string;
        due?: Date;
        score?: number;
        critical?: boolean;
        results?: Array<'pass' | 'fail' | 'rework' | 'pending' | null>;
        job?: 'manual' | 'processing';
      } = {},
    ) => {
      const taskId = randomUUID();
      const inspectionId = randomUUID();
      const due = input.due ?? new Date(Date.now() + 60 * 60_000);
      const starts = new Date(due.getTime() - 2 * 60 * 60_000);
      const siteId = siteIds[input.site ?? 0];
      const templateId = templateIds[input.ai ? 1 : 0];
      await pool.query(
        `INSERT INTO floorwalk.inspection_tasks
         (id, org_id, site_id, template_id, task_date, position, starts_at, due_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          taskId,
          orgId,
          siteId,
          templateId,
          input.date ?? today,
          position++,
          starts,
          due,
          input.results ? 'in_progress' : 'not_started',
        ],
      );
      if (input.results) {
        await pool.query(
          `INSERT INTO floorwalk.inspections (id, task_id, site_id, template_id, inspector_id, status, score, decided_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            inspectionId,
            taskId,
            siteId,
            templateId,
            managerId,
            input.score === undefined
              ? 'draft'
              : input.critical
                ? 'failed'
                : 'passed',
            input.score ?? null,
            input.score === undefined ? null : new Date(),
          ],
        );
        for (const [index, result] of input.results.entries()) {
          const itemId = randomUUID();
          const uploadedAt =
            result === null
              ? null
              : new Date(Math.min(Date.now(), due.getTime() - 60_000));
          await pool.query(
            `INSERT INTO floorwalk.inspection_items
             (id, inspection_id, position, title, critical, result, self_assessment,
              first_self_assessment, first_result, first_uploaded_by_id, uploaded_by_id, uploaded_at, upload_version)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $9, $10, $11)`,
            [
              itemId,
              inspectionId,
              index + 1,
              `检查项${index + 1}`,
              input.critical ?? false,
              result ?? 'pending',
              result === null ? null : 'pass',
              result === null || result === 'pending' ? null : result,
              result === null ? null : managerId,
              uploadedAt,
              result === null ? 0 : 1,
            ],
          );
          if (input.job && uploadedAt) {
            await pool.query(
              `INSERT INTO floorwalk.ai_review_jobs (inspection_item_id, uploaded_at, upload_version, status, attempt_count)
               VALUES ($1, $2, 1, $3, 4)`,
              [itemId, uploadedAt, input.job],
            );
          }
        }
      }
      return { taskId, inspectionId };
    };
    const open = async () => {
      await page.goto('/console');
      await expect(
        page.getByRole('heading', { name: '总部看板' }),
      ).toBeVisible();
    };
    return {
      pool,
      orgId,
      email,
      siteIds,
      managerId,
      managerLogin,
      today,
      addTask,
      open,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

test('FW-032 AC-01 今日任务、汇总、两类警告和两类人工待审', async ({
  page,
  dashboard,
}) => {
  const critical = await dashboard.addTask({
    score: 0,
    critical: true,
    results: ['fail'],
    due: new Date(Date.now() - 5 * 60_000),
  });
  await dashboard.addTask({ site: 1, due: new Date(Date.now() - 5 * 60_000) });
  const manual = await dashboard.addTask({ results: ['pending'] });
  const fallback = await dashboard.addTask({
    ai: true,
    results: ['pending'],
    job: 'manual',
  });
  await dashboard.addTask({
    ai: true,
    results: ['pending'],
    job: 'processing',
  });
  await dashboard.addTask({ site: 1 });
  const response = await page.request.get(`${apiBase}/dashboard/today`);
  expect(response.status()).toBe(200);
  const data = (await response.json()) as AdminTodayResponse;
  expect(data.summary).toEqual({ expected: 6, completed: 4, overdue: 1 });
  expect(data.tasks.find((task) => task.id === critical.taskId)).toMatchObject({
    score: 0,
    criticalFailure: true,
    status: 'submitted',
  });
  await dashboard.open();
  await page
    .getByLabel('控制台导航')
    .getByRole('button', { name: '今日视图', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: '今日视图' })).toBeVisible();
  const summary = page.getByRole('definition');
  await expect(summary).toHaveText(['6', '4', '1']);
  const tasks = page.getByRole('region', { name: '各店今日任务' });
  await expect(tasks.getByRole('row')).toHaveCount(7);
  await expect(tasks).toContainText('统计门店1');
  await expect(tasks).toContainText('统计门店2');
  await expect(tasks).toContainText('人工模板');
  await expect(tasks).toContainText('AI模板');
  await expect(tasks).toContainText('已提交');
  await expect(tasks).toContainText('未开始');
  await expect(tasks).toContainText('0 分');
  await expect(
    tasks.getByRole('cell').filter({ hasText: /^\d{2}:\d{2}–\d{2}:\d{2}$/ }),
  ).toHaveCount(6);
  const warnings = page.getByRole('region', { name: '警告', exact: true });
  await expect(warnings.getByRole('listitem')).toHaveCount(2);
  await expect(warnings).toContainText('严重项不合格');
  await expect(warnings).toContainText('任务逾期');
  const pending = page.getByRole('region', { name: '待我处理', exact: true });
  await expect(pending.getByRole('listitem')).toHaveCount(2);
  await expect(pending).toContainText('人工模板');
  await expect(pending).toContainText('AI模板');
  const queueResponse = await page.request.get(`${apiBase}/review/tasks`);
  const queue = await queueResponse.json();
  expect(queue.map((task: { id: string }) => task.id)).toEqual(
    expect.arrayContaining([manual.taskId, fallback.taskId]),
  );
  await expect(page.getByText('AI 审核中', { exact: true })).toHaveCount(0);
  await pending.getByRole('button', { name: '处理任务' }).first().click();
  await expect(
    page.getByRole('heading', { name: '检查项', exact: true }),
  ).toBeVisible();
});

test('FW-032 AC-02/03/04 周月指标、排行、趋势与商家隔离', async ({
  page,
  request,
  dashboard,
}) => {
  const completed = await dashboard.addTask({
    score: 80,
    results: ['pass', 'pass', 'fail'],
    due: new Date(Date.now() - 5 * 60_000),
  });
  // Reupload replaces uploaded_at after the deadline; the task was already complete.
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
  const secondManager = await page.request.post(`${apiBase}/admin/users`, {
    data: {
      loginName: `second-${dashboard.email}`,
      displayName: '第二店长',
      role: 'store_manager',
      siteId: dashboard.siteIds[1],
      password,
    },
  });
  expect(secondManager.status()).toBe(201);
  await dashboard.pool.query(
    'UPDATE floorwalk.inspection_items SET uploaded_by_id = $2 WHERE inspection_id = $1',
    [second.inspectionId, (await secondManager.json()).id],
  );
  await dashboard.addTask({ due: new Date(Date.now() - 5 * 60_000) });
  await dashboard.addTask();
  const weekResponse = await page.request.get(`${apiBase}/dashboard/period`, {
    params: { period: 'week' },
  });
  expect(weekResponse.status()).toBe(200);
  const week = (await weekResponse.json()) as DashboardPeriodResponse;
  expect(week.overall).toEqual({
    expected: 4,
    completed: 2,
    completionRate: 0.5,
    overdue: 1,
    averageScore: 60,
  });
  const monthResponse = await page.request.get(`${apiBase}/dashboard/period`, {
    params: { period: 'month' },
  });
  const month = (await monthResponse.json()) as DashboardPeriodResponse;
  const outsideWeek = month.from < week.from ? month.from : month.to;
  expect(outsideWeek < week.from || outsideWeek > week.to).toBe(true);
  await dashboard.addTask({
    date: outsideWeek,
    due: new Date(`${outsideWeek}T23:59:00+08:00`),
  });

  await dashboard.open();
  const metrics = page.getByRole('definition');
  await expect(metrics).toHaveText(['50%', '1', '50%', '60 分']);
  await expect(page.getByRole('region', { name: '门店统计' })).toContainText(
    '统计门店1',
  );
  await expect(page.getByRole('region', { name: '门店统计' })).toContainText(
    '统计门店2',
  );
  await page.getByRole('button', { name: '本月', exact: true }).click();
  await expect(metrics).toHaveText(['40%', /[12]/, '50%', '60 分']);
  await expect(
    page.getByText('本月应完成 5 项任务', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: '店长排行榜' }).click();
  const ranking = page.getByRole('region', { name: '店长排行榜' });
  await expect(ranking.getByRole('row').nth(1)).toContainText('统计店长');
  await expect(ranking.getByRole('row').nth(1)).toContainText('3');
  await expect(ranking.getByRole('row').nth(1)).toContainText('66.7%');
  await expect(ranking.getByRole('row').nth(1)).toContainText('50%');
  await expect(ranking.getByRole('row').nth(2)).toContainText('第二店长');
  await expect(ranking.getByRole('row').nth(2)).toContainText('1');
  await expect(ranking.getByRole('row').nth(2)).toContainText('0%');
  await expect(ranking.getByRole('row').nth(2)).toContainText('—');
  await page.getByRole('button', { name: '日期趋势' }).click();
  const trend = page.getByRole('region', { name: '日期趋势' });
  await expect(
    trend.getByRole('img', { name: '每日完成率与平均分折线图' }),
  ).toBeVisible();
  await expect(
    trend.getByRole('row').filter({ hasText: dashboard.today }),
  ).toContainText('2/4');
  await expect(
    trend.getByRole('row').filter({ hasText: outsideWeek }),
  ).toContainText('0/1');

  expect(
    (
      await request.post(`${apiBase}/auth/session`, {
        data: { loginName: dashboard.managerLogin, password },
      })
    ).status(),
  ).toBe(201);
  expect(
    (await request.get(`${apiBase}/dashboard/period?period=week`)).status(),
  ).toBe(403);
  expect(
    (
      await request.post(`${apiBase}/auth/session`, {
        data: { loginName: 'admin@demo2.example', password: 'northbean-demo' },
      })
    ).status(),
  ).toBe(201);
  const foreign = await request.get(`${apiBase}/dashboard/period?period=week`);
  expect(foreign.status()).toBe(200);
  const foreignData = (await foreign.json()) as DashboardPeriodResponse;
  expect(
    foreignData.sites.some(({ site }) => dashboard.siteIds.includes(site.id)),
  ).toBe(false);
  expect(
    (
      await request.get(`${apiBase}/stats/self-check`, {
        params: {
          scope: 'site',
          id: dashboard.siteIds[0],
          from: week.from,
          to: week.to,
        },
      })
    ).status(),
  ).toBe(404);
});

test('FW-032 AC-05 无任务时显示空状态且不显示空图', async ({
  page,
  dashboard,
}) => {
  await dashboard.open();
  await expect(page.getByText('本周暂无数据')).toBeVisible();
  await expect(
    page.getByRole('img', { name: '每日完成率与平均分折线图' }),
  ).toHaveCount(0);
  const previousDate = new Date(`${dashboard.today}T00:00:00Z`);
  previousDate.setUTCDate(previousDate.getUTCDate() - 14);
  await dashboard.addTask({
    date: previousDate.toISOString().slice(0, 10),
    due: previousDate,
    score: 76,
    results: ['pass'],
  });
  await page.getByRole('button', { name: '刷新看板' }).click();
  await expect(page.getByText('本周暂无数据')).toBeVisible();
  const site = page.getByRole('row').filter({ hasText: 'STAT-1' });
  await expect(site).toContainText('76');
  await expect(site).toContainText('已通过');
  await page
    .getByLabel('控制台导航')
    .getByRole('button', { name: '今日视图', exact: true })
    .click();
  await expect(page.getByText('今日无任务')).toBeVisible();
});
