import { expect, test } from '@playwright/test';

const email = 'inspector@northbean.example';
const password = 'northbean-demo';
const apiBase = `http://127.0.0.1:${3100 + Number(process.env.FW_SLOT) * 10}/api`;

async function readToday(page: import('@playwright/test').Page) {
  return page.evaluate(async (baseUrl) => {
    const token = localStorage.getItem('floorwalk.auth.token');
    const response = await fetch(`${baseUrl}/inspector/today`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.json();
  }, apiBase) as Promise<{
    site: { name: string };
    submittedToday: boolean;
    template: {
      name: string;
      items: Array<{ title: string; photoRequired: boolean }>;
    };
    reworkInspections: Array<{ id: string }>;
  }>;
}

test('店员登录、重启保持登录、查看我的并退出', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '开始巡检' })).toBeVisible();
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await expect(page.getByText('今日待巡')).toBeVisible();
  const today = await readToday(page);
  await expect(
    page.getByRole('heading', { name: today.site.name }),
  ).toBeVisible();
  await expect(page.getByText(today.template.name)).toBeVisible();
  await expect(
    page.getByText(today.submittedToday ? '今天已提交' : '今天尚未提交'),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('heading', { name: today.site.name }),
  ).toBeVisible();
  await page.getByLabel('我的').click();
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText(today.site.name)).toBeVisible();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('heading', { name: '开始巡检' })).toBeVisible();
});

test('错误密码显示中文错误提示', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill('wrong-password');
  await page.getByTestId('login-button').click();
  await expect(page.getByText('邮箱或密码错误。')).toBeVisible();
});

test('今日任务来自接口，未完成必拍项时阻止提交', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await page.getByTestId('start-inspection').click();
  await expect(page.getByRole('heading', { name: '巡检详情' })).toBeVisible();
  const today = await readToday(page);

  for (let index = 0; index < today.template.items.length; index += 1) {
    await page
      .getByTestId(`inspection-item-${index + 1}`)
      .getByRole('button', { name: '合格', exact: true })
      .click();
    await expect(page.getByText('当前结果：合格')).toHaveCount(index + 1);
  }
  await page.getByTestId('submit-inspection').click();
  const missingTitles = today.template.items
    .filter((item) => item.photoRequired)
    .map((item) => item.title)
    .join('、');
  await expect(page.getByText(`请完成：${missingTitles}`)).toBeVisible();
});

test('必拍项可以选择照片并随巡检提交', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await page.getByTestId('start-inspection').click();
  const today = await readToday(page);
  for (let index = 0; index < today.template.items.length; index += 1) {
    await page
      .getByTestId(`inspection-item-${index + 1}`)
      .getByRole('button', { name: '合格', exact: true })
      .click();
    await expect(page.getByText('当前结果：合格')).toHaveCount(index + 1);
  }
  const requiredItems = page.getByRole('button', { name: '选择照片' });
  const requiredCount = today.template.items.filter(
    (item) => item.photoRequired,
  ).length;
  for (let index = 0; index < requiredCount; index += 1) {
    const chooserPromise = page.waitForEvent('filechooser');
    await requiredItems.nth(index).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: `inspection-${index}.jpg`,
      mimeType: 'image/jpeg',
      buffer: Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2w==', 'base64'),
    });
  }
  await expect(page.getByText('已上传 1 张照片')).toHaveCount(requiredCount);
  await page.getByTestId('submit-inspection').click();
  await expect(page.getByText(/已提交：submitted/)).toBeVisible();
});

test('NB-002 打回单显示主管意见并可重新提交', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('邮箱').fill('inspector+nb-002@northbean.example');
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await expect(page.getByText('今日待巡')).toBeVisible();
  const today = await readToday(page);
  await expect(page.getByText('Northbean Coffee 2')).toBeVisible();
  await expect(page.getByText('状态：待补交')).toHaveCount(
    today.reworkInspections.length,
  );
  await page.getByText('状态：待补交').click();
  await expect(page.getByText('主管打回')).toBeVisible();
  await expect(page.getByText('需要补充或修改')).toBeVisible();
  await page.getByRole('button', { name: '提交巡检' }).click();
  await expect(page.getByText(/已提交：/)).toBeVisible();
});

test('无效登录凭证会回到登录页', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('floorwalk.auth.token', 'invalid-token'),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '开始巡检' })).toBeVisible();
});
