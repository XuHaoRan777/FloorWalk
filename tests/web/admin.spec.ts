import { expect, test, type Page } from '@playwright/test';
import { createPool } from '../../apps/api/src/db/client.js';

const configuredSlot = Number(process.env.FW_SLOT ?? 3);
const apiBase = `http://127.0.0.1:${3100 + configuredSlot * 10}/api`;
const password = 'northbean-demo';
const createdSiteIds: string[] = [];
const createdTemplateIds: string[] = [];
let initialCurrentTemplateId: string | undefined;

async function login(page: Page, email = 'supervisor@northbean.example') {
  await page.goto('/');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
}

test.afterAll(async () => {
  if (!createdSiteIds.length && !createdTemplateIds.length) return;
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  databaseUrl.pathname = `/floorwalk_e2e_${configuredSlot}`;
  const pool = createPool(databaseUrl.toString());
  try {
    if (initialCurrentTemplateId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'UPDATE floorwalk.templates SET is_current = false WHERE is_current',
        );
        await client.query(
          'UPDATE floorwalk.templates SET is_current = true WHERE id = $1',
          [initialCurrentTemplateId],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
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
  await page.getByRole('button', { name: '门店' }).click();
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

test('AC-05 模板检查项编辑、排序和设为当前匹配 API', async ({ page }) => {
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
    isCurrent: boolean;
  }>;
  initialCurrentTemplateId = initialTemplates.find(
    (template) => template.isCurrent,
  )?.id;
  expect(initialCurrentTemplateId).toBeTruthy();
  for (const template of initialTemplates) {
    const row = page.getByRole('button', { name: new RegExp(template.name) });
    await expect(row).toBeVisible();
    if (template.isCurrent) await expect(row).toContainText('当前模板');
  }

  await page.getByRole('button', { name: '新建模板' }).click();
  await page.getByLabel('模板名称').fill('界面模板');
  await page.getByLabel('检查项 1 标题').fill('新顺序第一项');
  const firstItem = page.getByRole('listitem').filter({
    has: page.getByLabel('检查项 1 标题'),
  });
  await firstItem.getByLabel('必拍').check();
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
  const created = await (await createResponse).json();
  createdTemplateIds.push(created.id);
  expect(created.isCurrent).toBe(false);
  expect(created.items.map((item: { title: string }) => item.title)).toEqual([
    '新顺序第二项',
    '新顺序第一项',
  ]);
  expect(created.items[1].photoRequired).toBe(true);
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

  const currentResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/admin/templates/${created.id}/current`) &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '设为当前' }).click();
  const current = await (await currentResponse).json();
  expect(current.isCurrent).toBe(true);
  await expect(
    page.getByRole('button', { name: /界面模板修改/ }),
  ).toContainText('当前模板');

  const finalResponse = await page.request.get(`${apiBase}/admin/templates`);
  const finalTemplates = (await finalResponse.json()) as Array<{
    id: string;
    isCurrent: boolean;
  }>;
  expect(finalTemplates.filter((template) => template.isCurrent)).toEqual([
    expect.objectContaining({ id: created.id, isCurrent: true }),
  ]);
});

test('AC-07 管理接口错误和网络错误显示中文提示，401 回登录页', async ({
  page,
}) => {
  await login(page);
  await expect(page.getByRole('heading', { name: /审核队列/ })).toBeVisible();
  await page.getByRole('button', { name: '门店' }).click();
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
  await expect(page.getByLabel('邮箱')).toBeVisible();
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
