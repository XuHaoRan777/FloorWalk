import { expect, test, type Page } from '@playwright/test';
import type { TaskReview } from '@libs/shared';
import { createPool } from '../../apps/api/src/db/client.js';

const configuredSlot = Number(process.env.FW_SLOT ?? 3);
const apiBase = `http://127.0.0.1:${3100 + configuredSlot * 10}/api`;
const password = 'northbean-demo';
const createdSiteIds: string[] = [];
const createdUserIds: string[] = [];
const createdTemplateIds: string[] = [];
const createdStandardIds: string[] = [];

async function login(page: Page, loginName = 'hq@northbean.example') {
  await page.goto('/');
  await page.getByLabel('登录名').fill(loginName);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
}

test.afterAll(async () => {
  if (
    !createdSiteIds.length &&
    !createdUserIds.length &&
    !createdTemplateIds.length &&
    !createdStandardIds.length
  )
    return;
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  databaseUrl.pathname = `/floorwalk_e2e_${configuredSlot}`;
  const pool = createPool(databaseUrl.toString());
  try {
    if (createdUserIds.length) {
      await pool.query(
        'DELETE FROM floorwalk.sessions WHERE user_id = ANY($1::uuid[])',
        [createdUserIds],
      );
      await pool.query(
        'DELETE FROM floorwalk.users WHERE id = ANY($1::uuid[])',
        [createdUserIds],
      );
    }
    if (createdTemplateIds.length) {
      await pool.query(
        'DELETE FROM floorwalk.template_items WHERE template_id = ANY($1::uuid[])',
        [createdTemplateIds],
      );
      await pool.query(
        'DELETE FROM floorwalk.templates WHERE id = ANY($1::uuid[])',
        [createdTemplateIds],
      );
    }
    if (createdStandardIds.length)
      await pool.query(
        'DELETE FROM floorwalk.ai_review_standards WHERE id = ANY($1::uuid[])',
        [createdStandardIds],
      );
    if (createdSiteIds.length)
      await pool.query(
        'DELETE FROM floorwalk.sites WHERE id = ANY($1::uuid[])',
        [createdSiteIds],
      );
  } finally {
    await pool.end();
  }
});

test('AC-04 门店列表、创建、改名、停用与重新启用匹配 API', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: '门店', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '门店', exact: true }),
  ).toBeVisible();

  const initialResponse = await page.request.get(`${apiBase}/admin/sites`);
  expect(initialResponse.ok()).toBeTruthy();
  const initialSites = (await initialResponse.json()) as Array<{
    code: string;
    name: string;
    active: boolean;
  }>;
  expect(initialSites.length).toBeGreaterThan(0);
  for (const site of initialSites) {
    const row = page.getByRole('row').filter({ hasText: site.code });
    await expect(row).toContainText(site.name);
    await expect(row).toContainText(site.active ? '启用' : '已停用');
  }

  const code = `FW013-WEB-${Date.now()}`;
  await page.getByLabel('门店编码').fill(code);
  await page.getByLabel('门店名称').fill('界面新建门店');
  const createdResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/admin/sites') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '新建门店' }).click();
  const created = await (await createdResponse).json();
  createdSiteIds.push(created.id);
  expect(created.active).toBe(true);
  let row = page.getByRole('row').filter({ hasText: code });
  await expect(row).toContainText(created.name);
  await expect(row).toContainText('启用');

  await row.getByRole('button', { name: '改名' }).click();
  await page.getByLabel(`门店名称 ${code}`).fill('界面修改名称');
  const renameResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/admin/sites/${created.id}`) &&
      response.request().method() === 'PATCH',
  );
  await row.getByRole('button', { name: '保存名称' }).click();
  const renamed = await (await renameResponse).json();
  expect(renamed.name).toBe('界面修改名称');
  row = page.getByRole('row').filter({ hasText: code });
  await expect(row).toContainText(renamed.name);

  page.once('dialog', (dialog) => dialog.accept());
  const deactivateResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/admin/sites/${created.id}`) &&
      response.request().method() === 'PATCH',
  );
  await row.getByRole('button', { name: '停用' }).click();
  const deactivated = await (await deactivateResponse).json();
  expect(deactivated.active).toBe(false);
  await expect(row).toContainText('已停用');

  const reactivateResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/admin/sites/${created.id}`) &&
      response.request().method() === 'PATCH',
  );
  await row.getByRole('button', { name: '重新启用' }).click();
  const reactivated = await (await reactivateResponse).json();
  expect(reactivated.active).toBe(true);
  await expect(row).toContainText('启用');
});

test('FW-026 模板检查项编辑与排序匹配 API', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: '模板' }).click();
  await expect(
    page.getByRole('heading', { name: '模板', exact: true }),
  ).toBeVisible();
  const initialResponse = await page.request.get(`${apiBase}/admin/templates`);
  expect(initialResponse.ok()).toBeTruthy();
  const initialTemplates = (await initialResponse.json()) as Array<{
    id: string;
    name: string;
    items: unknown[];
  }>;
  for (const template of initialTemplates) {
    const row = page.getByRole('button', {
      name: `${template.name} ${template.items.length} 项`,
      exact: true,
    });
    await expect(row).toBeVisible();
  }

  await page.getByRole('button', { name: '新建模板' }).click();
  await page.getByLabel('模板名称').fill('界面模板');
  await page.getByLabel('启用 AI', { exact: true }).uncheck();
  await page.getByLabel('检查项 1 标题').fill('新顺序第一项');
  await page.getByLabel('检查项 1 最少照片张数').fill('2');
  await page.getByLabel('检查项 1 验收要点').fill('台面清洁，物品分类摆放。');
  const firstItem = page.getByRole('listitem').filter({
    has: page.getByLabel('检查项 1 标题'),
  });
  await firstItem.getByLabel('严重项').check();
  await page.getByRole('button', { name: '添加检查项' }).click();
  await page.getByLabel('检查项 2 标题').fill('新顺序第二项');
  await page.getByRole('button', { name: '检查项 2 上移' }).click();
  await expect(page.getByLabel('检查项 1 标题')).toHaveValue('新顺序第二项');
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/admin/templates') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '创建模板' }).click();
  const createdResult = await createResponse;
  const created = await createdResult.json();
  createdTemplateIds.push(created.id);
  expect(createdResult.status()).toBe(201);
  expect(created.aiEnabled).toBe(false);
  expect(created.aiStandardId).toBeNull();
  expect(created.items.map((item: { title: string }) => item.title)).toEqual([
    '新顺序第二项',
    '新顺序第一项',
  ]);
  expect(created.items[1].minPhotoCount).toBe(2);
  expect(created.items[1].acceptanceCriteria).toBe('台面清洁，物品分类摆放。');
  expect(created.items[1].critical).toBe(true);

  await page.getByLabel('模板名称').fill('界面模板修改');
  await page.getByLabel('检查项 1 标题').fill('已编辑第一项');
  await page.getByRole('button', { name: '添加检查项' }).click();
  await page.getByLabel('检查项 3 标题').fill('待移除项');
  await page
    .getByRole('listitem')
    .filter({ has: page.getByLabel('检查项 3 标题') })
    .getByRole('button', { name: '移除' })
    .click();
  const updateResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/admin/templates/${created.id}`) &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: '保存修改' }).click();
  const updated = await (await updateResponse).json();
  expect(updated.name).toBe('界面模板修改');
  expect(updated.items[0].title).toBe('已编辑第一项');

  const finalResponse = await page.request.get(`${apiBase}/admin/templates`);
  const finalTemplates = (await finalResponse.json()) as Array<{
    id: string;
    name: string;
    items: Array<{ title: string; minPhotoCount: number }>;
  }>;
  expect(finalTemplates.find((template) => template.id === created.id)).toEqual(
    expect.objectContaining({
      name: '界面模板修改',
      items: expect.arrayContaining([
        expect.objectContaining({ title: '已编辑第一项' }),
        expect.objectContaining({ title: '新顺序第一项', minPhotoCount: 2 }),
      ]),
    }),
  );
});

test('FW-026 AC-07 咖啡店快捷配置后修改最少张数，刷新并重选模板后保留', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('button', { name: '模板', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '模板', exact: true }),
  ).toBeVisible();
  const quickResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/admin/templates/quick-setup') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '咖啡店', exact: true }).click();
  const quickResult = await quickResponse;
  const { template, standard } = await quickResult.json();
  createdTemplateIds.push(template.id);
  createdStandardIds.push(standard.id);
  expect(quickResult.status()).toBe(201);
  await expect(page.getByLabel('模板名称')).toHaveValue(template.name);
  await expect(page.getByLabel('启用 AI', { exact: true })).toBeChecked();
  const standardSelect = page.getByLabel('AI 审核标准', { exact: true });
  await expect(standardSelect).toHaveValue(standard.id);
  await expect(standardSelect.locator('option:checked')).toHaveText(
    standard.name,
  );

  await page.getByLabel('检查项 1 最少照片张数').fill('3');
  const updateResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/admin/templates/${template.id}`) &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  const updateResult = await updateResponse;
  expect(updateResult.status()).toBe(200);
  expect((await updateResult.json()).items[0].minPhotoCount).toBe(3);

  await page.reload();
  await expect(page.getByRole('heading', { name: /总部看板/ })).toBeVisible();
  const refreshResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/admin/templates') &&
      response.request().method() === 'GET',
  );
  await page.getByRole('button', { name: '模板', exact: true }).click();
  expect((await refreshResponse).ok()).toBeTruthy();
  await page
    .getByRole('button', {
      name: `${template.name} ${template.items.length} 项`,
      exact: true,
    })
    .click();
  await expect(page.getByLabel('模板名称')).toHaveValue(template.name);
  await expect(page.getByLabel('检查项 1 最少照片张数')).toHaveValue('3');
  await expect(standardSelect).toHaveValue(standard.id);
  await expect(standardSelect.locator('option:checked')).toHaveText(
    standard.name,
  );
  await page.screenshot({
    path: 'docs/work/FW-026-templates-ai-criteria/evidence/web-template-saved.png',
    fullPage: true,
  });

  await page.getByRole('button', { name: 'AI 审核标准', exact: true }).click();
  await page.getByRole('button', { name: standard.name, exact: true }).click();
  await expect(page.getByLabel('提示词')).toHaveValue(standard.prompt);
  await page.getByRole('button', { name: '新建标准', exact: true }).click();
  const standardName = `界面审核标准-${Date.now()}`;
  await page.getByLabel('标准名称').fill(standardName);
  await page
    .getByLabel('提示词')
    .fill('仅依据照片中可见的信息对照验收要点审核。');
  const standardResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/admin/ai-standards') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '创建标准', exact: true }).click();
  const standardResult = await standardResponse;
  const createdStandard = await standardResult.json();
  createdStandardIds.push(createdStandard.id);
  expect(standardResult.status()).toBe(201);
  await expect(page.getByLabel('标准名称')).toHaveValue(standardName);
  const revisedPrompt = '逐项审核验收要点，无法从照片确认时说明原因。';
  await page.getByLabel('提示词').fill(revisedPrompt);
  const revisedResponse = page.waitForResponse(
    (response) =>
      response
        .url()
        .endsWith(`/api/admin/ai-standards/${createdStandard.id}`) &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  const revisedResult = await revisedResponse;
  expect(revisedResult.status()).toBe(200);
  expect((await revisedResult.json()).prompt).toBe(revisedPrompt);
  await expect(page.getByLabel('提示词')).toHaveValue(revisedPrompt);
});

test('FW-026 AC-02 审核详情展示快照中的最少张数、备注要求和验收要点', async ({
  page,
}) => {
  await login(page);
  await expect(page.getByRole('heading', { name: /总部看板/ })).toBeVisible();
  const queueResponse = await page.request.get(`${apiBase}/review/tasks`);
  expect(queueResponse.ok()).toBe(true);
  const [source] = (await queueResponse.json()) as TaskReview[];
  expect(source).toBeTruthy();
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  databaseUrl.pathname = `/floorwalk_e2e_${configuredSlot}`;
  const pool = createPool(databaseUrl.toString());
  let taskId: string | undefined;
  let inspectionId: string | undefined;
  try {
    const suffix = Date.now();
    const siteResponse = await page.request.post(`${apiBase}/admin/sites`, {
      data: {
        code: `FW026-${suffix}`,
        name: `FW-026 快照门店 ${suffix}`,
      },
    });
    expect(siteResponse.status()).toBe(201);
    const site = (await siteResponse.json()) as { id: string; name: string };
    createdSiteIds.push(site.id);
    const managerResponse = await page.request.post(`${apiBase}/admin/users`, {
      data: {
        loginName: `fw026-${suffix}@example.test`,
        displayName: 'FW-026 测试店长',
        role: 'store_manager',
        siteId: site.id,
        password: 'initial-password',
      },
    });
    expect(managerResponse.status()).toBe(201);
    const manager = (await managerResponse.json()) as { id: string };
    createdUserIds.push(manager.id);
    const createdTask = await pool.query<{ id: string; taskDate: string }>(
      `INSERT INTO floorwalk.inspection_tasks
       (org_id, site_id, template_id, task_date, position, occurrence,
        starts_at, due_at, status)
       SELECT site.org_id, site.id, $2, CURRENT_DATE, 99, 99,
         now() + interval '1 hour', now() + interval '2 hours', 'submitted'
       FROM floorwalk.sites site WHERE site.id = $1
       RETURNING id, task_date::text AS "taskDate"`,
      [site.id, source.templateId],
    );
    taskId = createdTask.rows[0].id;
    const taskDate = createdTask.rows[0].taskDate;
    const createdInspection = await pool.query<{ id: string }>(
      `INSERT INTO floorwalk.inspections
       (task_id, site_id, template_id, inspector_id, status, submitted_at)
       VALUES ($1, $2, $3, $4, 'submitted', now()) RETURNING id`,
      [taskId, site.id, source.templateId, manager.id],
    );
    inspectionId = createdInspection.rows[0].id;
    await pool.query(
      `INSERT INTO floorwalk.inspection_items
       (inspection_id, position, title, critical, min_photo_count,
        acceptance_criteria, result, uploaded_by_id, uploaded_at, note)
       VALUES ($1, 1, 'FW026 两张照片项', false, 2,
         '台面清洁，物品分类摆放。', 'pending', $2, now(), NULL),
              ($1, 2, 'FW026 文字说明项', false, 0,
         '记录现场检查情况。', 'pending', $2, now(), '现场已检查')`,
      [inspectionId, manager.id],
    );
    const detailResponse = await page.request.get(
      `${apiBase}/tasks/${taskId}/review`,
    );
    expect(detailResponse.ok()).toBe(true);
    const detail = (await detailResponse.json()) as TaskReview;
    expect(detail.inspectionId).toBe(inspectionId);
    expect(detail.items.map((item) => item.minPhotoCount)).toEqual([2, 0]);
    expect(detail.items[0]).not.toHaveProperty('photoRequired');

    await page
      .getByLabel('控制台导航')
      .getByRole('button', { name: '审核队列', exact: true })
      .click();
    await page
      .getByRole('button')
      .filter({ hasText: site.name })
      .filter({ hasText: taskDate })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: site.name })).toBeVisible();
    const photoItem = page.getByRole('article').filter({
      has: page.getByRole('heading', { name: /FW026 两张照片项/ }),
    });
    await expect(photoItem).toContainText('至少 2 张照片');
    await expect(photoItem).not.toContainText('无需照片');
    await expect(photoItem).toContainText('验收要点：台面清洁，物品分类摆放。');
    await expect(
      page.getByRole('article').filter({
        has: page.getByRole('heading', {
          name: /FW026 文字说明项/,
        }),
      }),
    ).toContainText('可不上传照片，需填写备注');
  } finally {
    if (inspectionId) {
      await pool.query(
        'DELETE FROM floorwalk.inspection_items WHERE inspection_id = $1',
        [inspectionId],
      );
      await pool.query('DELETE FROM floorwalk.inspections WHERE id = $1', [
        inspectionId,
      ]);
    }
    if (taskId)
      await pool.query('DELETE FROM floorwalk.inspection_tasks WHERE id = $1', [
        taskId,
      ]);
    await pool.end();
  }
});

test('AC-07 管理接口错误和网络错误显示中文提示，401 回登录页', async ({
  page,
}) => {
  await login(page);
  await expect(page.getByRole('heading', { name: /总部看板/ })).toBeVisible();
  await page.getByRole('button', { name: '门店', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '门店', exact: true }),
  ).toBeVisible();
  const errors = [
    [400, '请求内容不合法。'],
    [403, '当前账号没有权限执行此操作。'],
    [404, '门店不存在。'],
    [409, '门店编码已存在。'],
  ] as const;

  for (const [status, message] of errors) {
    await page.route('**/api/admin/sites', async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'ERROR', message }),
      });
    });
    await page.getByRole('button', { name: '刷新' }).click();
    await expect(page.getByRole('alert')).toContainText(message);
    await page.unroute('**/api/admin/sites');
  }

  await page.route('**/api/admin/sites', (route) => route.abort());
  await page.getByRole('button', { name: '刷新' }).click();
  await expect(page.getByRole('alert')).toContainText(/网络连接失败/);
  await page.unroute('**/api/admin/sites');

  await page.route('**/api/admin/sites', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'UNAUTHENTICATED',
        message: '登录凭证无效。',
      }),
    });
  });
  await page.getByRole('button', { name: '刷新' }).click();
  await expect(page.getByLabel('登录名')).toBeVisible();
});

test('AC-06 总部看板标记停用门店并保留最近分数', async ({ page }) => {
  await login(page, 'hq@northbean.example');
  await expect(page.getByRole('heading', { name: /总部看板/ })).toBeVisible();
  const beforeResponse = await page.request.get(`${apiBase}/dashboard/sites`);
  const beforeSites = (await beforeResponse.json()) as Array<{
    site: { id: string; code: string; name: string; active: boolean };
    latestScore: number | null;
  }>;
  const target = beforeSites.find((entry) => entry.site.code === 'NB-001');
  expect(target).toBeTruthy();
  if (!target) throw new Error('NB-001 is missing from the dashboard');

  await page.request
    .patch(`${apiBase}/admin/sites/${target.site.id}`, {
      data: { active: false },
    })
    .then((response) => expect(response.ok()).toBeTruthy());
  try {
    await page.getByRole('button', { name: '刷新' }).click();
    const row = page.getByRole('row').filter({ hasText: 'NB-001' });
    await expect(row).toContainText('已停用');
    if (target.latestScore !== null)
      await expect(row).toContainText(String(target.latestScore));
    const afterResponse = await page.request.get(`${apiBase}/dashboard/sites`);
    const afterSites = (await afterResponse.json()) as typeof beforeSites;
    const stopped = afterSites.find(
      (entry) => entry.site.id === target.site.id,
    );
    expect(stopped?.site.active).toBe(false);
    expect(stopped?.latestScore).toBe(target.latestScore);
  } finally {
    await page.request
      .patch(`${apiBase}/admin/sites/${target.site.id}`, {
        data: { active: true },
      })
      .then((response) => expect(response.ok()).toBeTruthy());
  }
});
