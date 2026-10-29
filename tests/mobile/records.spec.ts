import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createPool } from '../../apps/api/src/db/client.js';

const email = 'inspector@northbean.example';
const password = 'northbean-demo';
const apiBase = `http://127.0.0.1:${3100 + Number(process.env.FW_SLOT) * 10}/api`;
const createdInspectionIds: string[] = [];
let colleagueId: string | undefined;
let colleagueInspectionId: string | undefined;

type RecordItem = {
  id: string;
  status: 'draft' | 'submitted' | 'in_review' | 'rework' | 'failed' | 'passed';
  score: number | null;
  createdAt: string;
  submittedAt: string | null;
};

const statusLabels: Record<RecordItem['status'], string> = {
  draft: '草稿',
  submitted: '待审核',
  in_review: '审核中',
  rework: '待补交',
  failed: '未通过',
  passed: '已通过',
};

const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

function slotDatabaseUrl() {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  databaseUrl.pathname = `/floorwalk_e2e_${process.env.FW_SLOT}`;
  return databaseUrl.toString();
}

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await expect(page.getByLabel('记录')).toBeVisible();
}

async function readAllRecords(page: Page) {
  const items: RecordItem[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: '10' });
    if (cursor) query.set('cursor', cursor);
    const response = await page
      .context()
      .request.get(`${apiBase}/inspector/inspections?${query.toString()}`);
    expect(response.status()).toBe(200);
    const pageBody = (await response.json()) as {
      items: RecordItem[];
      nextCursor: string | null;
    };
    items.push(...pageBody.items);
    cursor = pageBody.nextCursor;
  } while (cursor);
  return items;
}

async function createTestRecords(page: Page) {
  const todayResponse = await page
    .context()
    .request.get(`${apiBase}/inspector/today`);
  expect(todayResponse.status()).toBe(200);
  const today = (await todayResponse.json()) as {
    site: { id: string };
    template: { id: string };
  };

  for (let index = 0; index < 19; index += 1) {
    const response = await page
      .context()
      .request.post(`${apiBase}/inspections`, {
        data: { templateId: today.template.id },
      });
    expect(response.status()).toBe(201);
    const inspection = (await response.json()) as { id: string };
    createdInspectionIds.push(inspection.id);
  }

  const pool = createPool(slotDatabaseUrl());
  try {
    const colleague = await pool.query<{ id: string }>(
      `INSERT INTO floorwalk.users (email, password_hash, display_name, role, site_id)
       VALUES ($1, 'test-hash', '同店测试店员', 'inspector', $2)
       RETURNING id`,
      [`records-${randomUUID()}@northbean.example`, today.site.id],
    );
    colleagueId = colleague.rows[0].id;
    const record = await pool.query<{ id: string }>(
      `INSERT INTO floorwalk.inspections
         (site_id, template_id, inspector_id, status, score, submitted_at, decided_at)
       VALUES ($1, $2, $3, 'passed', 100, now(), now()) RETURNING id`,
      [today.site.id, today.template.id, colleagueId],
    );
    colleagueInspectionId = record.rows[0].id;
    await pool.query(
      `INSERT INTO floorwalk.inspection_items
         (inspection_id, position, title, photo_required, critical, result, note)
       SELECT $1, position, title, photo_required, critical, 'pass',
              CASE WHEN position = 1 THEN '同店店员填写的记录备注' ELSE NULL END
       FROM floorwalk.template_items WHERE template_id = $2`,
      [colleagueInspectionId, today.template.id],
    );
  } finally {
    await pool.end();
  }
}

test.afterEach(async () => {
  const pool = createPool(slotDatabaseUrl());
  try {
    const inspectionIds = [
      ...createdInspectionIds,
      ...(colleagueInspectionId ? [colleagueInspectionId] : []),
    ];
    if (inspectionIds.length) {
      await pool.query(
        'DELETE FROM floorwalk.inspection_items WHERE inspection_id = ANY($1::uuid[])',
        [inspectionIds],
      );
      await pool.query(
        'DELETE FROM floorwalk.inspections WHERE id = ANY($1::uuid[])',
        [inspectionIds],
      );
    }
    if (colleagueId)
      await pool.query('DELETE FROM floorwalk.users WHERE id = $1', [
        colleagueId,
      ]);
  } finally {
    await pool.end();
    createdInspectionIds.length = 0;
    colleagueId = undefined;
    colleagueInspectionId = undefined;
  }
});

test('记录列表按 API 分页显示，支持加载更多和刷新回到第一页', async ({
  page,
}) => {
  await login(page);
  await createTestRecords(page);
  const expectedRecords = await readAllRecords(page);
  expect(expectedRecords.length).toBeGreaterThanOrEqual(20);
  expect(
    expectedRecords.some((record) => record.id === colleagueInspectionId),
  ).toBe(true);

  await page.getByLabel('记录').click();
  const rows = page.locator('[data-testid^="record-row-"]');
  await expect(rows).toHaveCount(10);
  const firstPageIds = expectedRecords.slice(0, 10).map((record) => record.id);
  expect(
    await rows.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-testid')?.slice(11)),
    ),
  ).toEqual(firstPageIds);

  const firstRecord = expectedRecords[0];
  const firstRow = page.getByTestId(`record-row-${firstRecord.id}`);
  await expect(
    firstRow.getByText(`状态：${statusLabels[firstRecord.status]}`),
  ).toBeVisible();
  await expect(
    firstRow.getByText(
      `分数：${firstRecord.score === null ? '—' : `${firstRecord.score} 分`}`,
    ),
  ).toBeVisible();
  await expect(
    firstRow.getByText(`创建时间：${formatDate(firstRecord.createdAt)}`),
  ).toBeVisible();
  await expect(
    firstRow.getByText(`提交时间：${formatDate(firstRecord.submittedAt)}`),
  ).toBeVisible();

  await page.getByTestId('load-more-records').click();
  await expect(rows).toHaveCount(Math.min(expectedRecords.length, 20));
  await page.getByTestId('load-more-records').click();
  await expect(rows).toHaveCount(expectedRecords.length);
  expect(
    await rows.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-testid')?.slice(11)),
    ),
  ).toEqual(expectedRecords.map((record) => record.id));
  await expect(page.getByText('没有更多了')).toBeVisible();

  await page.getByLabel('刷新记录').click();
  await expect(rows).toHaveCount(10);
  expect(
    await rows.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-testid')?.slice(11)),
    ),
  ).toEqual(firstPageIds);
});

test('记录详情只读显示检查项、照片和按时间排列的审核历史', async ({ page }) => {
  await login(page);
  const records = await readAllRecords(page);
  let expected: {
    id: string;
    status: RecordItem['status'];
    score: number | null;
    items: Array<{
      position: number;
      title: string;
      result: string;
      note: string | null;
      evidence: Array<{ id: string }>;
    }>;
    reviews: Array<{ id: string; action: string; comment: string | null }>;
  } | null = null;

  for (const record of records) {
    const response = await page
      .context()
      .request.get(`${apiBase}/inspections/${record.id}`);
    if (!response.ok()) continue;
    const detail = (await response.json()) as NonNullable<typeof expected>;
    if (
      detail.items.some((item) => item.evidence.length) &&
      detail.reviews.length
    ) {
      expected = detail;
      break;
    }
  }
  expect(expected).not.toBeNull();
  if (!expected) throw new Error('种子记录缺少照片或审核历史。');

  await page.getByLabel('记录').click();
  await page.getByTestId(`record-row-${expected.id}`).click();
  await expect(page.getByTestId('record-detail-summary')).toContainText(
    statusLabels[expected.status],
  );
  await expect(page.getByTestId('record-detail-summary')).toContainText(
    expected.score === null ? '分数：—' : `分数：${expected.score} 分`,
  );

  for (const item of expected.items) {
    const row = page.getByTestId(`record-item-${item.position}`);
    await expect(row).toContainText(item.title);
    await expect(row).toContainText(
      `结果：${item.result === 'pass' ? '合格' : item.result === 'fail' ? '不合格' : '未检查'}`,
    );
    await expect(row).toContainText(`备注：${item.note || '—'}`);
    for (const evidence of item.evidence)
      await expect(
        page.getByTestId(`record-photo-${evidence.id}`),
      ).toBeVisible();
  }

  const reviews = page.locator('[data-testid^="review-"]');
  await expect(reviews).toHaveCount(expected.reviews.length);
  const renderedReviewIds = await reviews.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-testid')?.slice(7)),
  );
  expect(renderedReviewIds).toEqual(
    expected.reviews.map((review) => review.id),
  );
  await expect(page.getByText('巡检聊天')).toBeVisible();
  await expect(page.getByLabel('聊天内容')).toBeVisible();
  await expect(page.getByRole('button', { name: '发送' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /合格|不合格|提交巡检/ }),
  ).toHaveCount(0);
});

test('记录列表区分首次加载和空列表', async ({ page }) => {
  await login(page);
  let releaseResponse: (() => void) | undefined;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route('**/api/inspector/inspections*', async (route) => {
    await responseGate;
    await route.continue();
  });
  const initialResponse = page.waitForResponse((response) =>
    response.url().includes('/api/inspector/inspections'),
  );
  await page.getByLabel('记录').click();
  await expect(page.getByText('正在加载巡检记录…')).toBeVisible();
  releaseResponse?.();
  await initialResponse;
  const expectedRecords = await readAllRecords(page);
  await expect(page.locator('[data-testid^="record-row-"]')).toHaveCount(
    expectedRecords.length,
  );

  await page.unroute('**/api/inspector/inspections*');
  await page.route('**/api/inspector/inspections*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], nextCursor: null }),
    }),
  );
  await page.getByLabel('刷新记录').click();
  await expect(page.getByText('暂无巡检记录。')).toBeVisible();
});

test('网络错误、接口错误显示中文提示，401 返回登录页', async ({ page }) => {
  await login(page);
  const initialResponse = page.waitForResponse((response) =>
    response.url().includes('/api/inspector/inspections'),
  );
  await page.getByLabel('记录').click();
  await initialResponse;

  const outcomes: Array<
    | { type: 'network'; message: string }
    | { type: 'http'; status: number; code: string; message: string }
  > = [
    { type: 'network', message: '网络连接失败，请检查网络后重试。' },
    {
      type: 'http',
      status: 400,
      code: 'VALIDATION_FAILED',
      message: '提交内容有误，请检查后重试。',
    },
    {
      type: 'http',
      status: 403,
      code: 'FORBIDDEN',
      message: '当前账号没有权限执行此操作。',
    },
    {
      type: 'http',
      status: 404,
      code: 'NOT_FOUND',
      message: '请求的数据不存在。',
    },
    {
      type: 'http',
      status: 401,
      code: 'UNAUTHENTICATED',
      message: '登录已失效，请重新登录。',
    },
  ];
  let current = 0;
  await page.route('**/api/inspector/inspections*', async (route) => {
    const outcome = outcomes[current];
    if (!outcome) return route.continue();
    current += 1;
    if (outcome.type === 'network') return route.abort();
    await route.fulfill({
      status: outcome.status,
      contentType: 'application/json',
      body: JSON.stringify({ code: outcome.code, message: 'API error' }),
    });
  });

  for (const outcome of outcomes.slice(0, -1)) {
    await page.getByLabel('刷新记录').click();
    await expect(page.getByText(outcome.message)).toBeVisible();
  }

  await page.getByLabel('刷新记录').click();
  await expect(page.getByRole('heading', { name: '开始巡检' })).toBeVisible();
});
