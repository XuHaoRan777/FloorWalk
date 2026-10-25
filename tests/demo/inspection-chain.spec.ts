import { expect, test } from '@playwright/test';

const mobileUrl = `http://127.0.0.1:${3100 + Number(process.env.FW_SLOT) * 10 + 2}`;
const webUrl = `http://127.0.0.1:${3100 + Number(process.env.FW_SLOT) * 10 + 1}`;
const password = 'northbean-demo';

test('店员、主管与总部通过真实界面完成 NB-001 巡检闭环', async ({ page }) => {
  await page.goto(mobileUrl);
  await page.getByLabel('邮箱').fill('inspector@northbean.example');
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await expect(page.getByText('今日待巡')).toBeVisible();
  await page.getByTestId('start-inspection').click();
  await expect(page.getByRole('heading', { name: '巡检详情' })).toBeVisible();

  const itemCards = page.locator('[data-testid^="inspection-item-"]');
  await expect(itemCards).toHaveCount(8);
  let coldItem = page.locator('[data-testid="inspection-item-1"]');
  for (let index = 0; index < 8; index += 1) {
    const card = page.locator(`[data-testid="inspection-item-${index + 1}"]`);
    const title = (await card.innerText()).split('\n')[0] ?? '';
    if (title.includes('冷柜')) {
      coldItem = card;
      await card.getByRole('button', { name: '不合格', exact: true }).click();
    } else {
      await card.getByRole('button', { name: '合格', exact: true }).click();
    }
    if (await card.getByRole('button', { name: '选择照片' }).count()) {
      const chooserPromise = page.waitForEvent('filechooser');
      await card.getByRole('button', { name: '选择照片' }).click();
      const chooser = await chooserPromise;
      await chooser.setFiles({
        name: `nb001-${index + 1}.jpg`,
        mimeType: 'image/jpeg',
        buffer: Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2w==', 'base64'),
      });
      await expect(
        card.getByRole('button', { name: '已上传 1 张照片' }),
      ).toBeVisible();
    }
  }
  await expect(coldItem.getByText('当前结果：不合格')).toBeVisible();
  const [firstSubmit] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/inspections/') &&
        response.url().endsWith('/submit') &&
        response.request().method() === 'POST',
    ),
    page.getByTestId('submit-inspection').click(),
  ]);
  expect(firstSubmit.status()).toBe(201);
  expect((await firstSubmit.json()).score).toBe(88);
  await expect(page.getByText('已提交：submitted，分数 88')).toBeVisible();

  const supervisor = await page.context().newPage();
  await supervisor.goto(webUrl);
  await supervisor.getByLabel('邮箱').fill('supervisor@northbean.example');
  await supervisor.getByLabel('密码').fill(password);
  await supervisor.getByRole('button', { name: '登录' }).click();
  await expect(
    supervisor.getByRole('heading', { name: /审核队列/ }),
  ).toBeVisible();
  const firstReview = supervisor
    .getByRole('button')
    .filter({ hasText: 'NB-001' })
    .filter({ hasText: 'Northbean Coffee 1' });
  await expect(firstReview).toBeVisible();
  await expect(firstReview).toContainText('88');
  await firstReview.click();
  const coldReviewItem = supervisor
    .locator('article')
    .filter({ hasText: '冷柜温度' });
  await supervisor.getByRole('button', { name: '打回', exact: true }).click();
  await coldReviewItem.getByLabel('选择为打回项').check();
  await supervisor.getByRole('button', { name: '确认打回' }).click();
  await expect(supervisor.getByText('已打回', { exact: true })).toBeVisible();

  await page.getByLabel('返回今日待巡').click();
  const reworkCard = page.getByText('状态：待补交').last();
  await expect(reworkCard).toBeVisible();
  await reworkCard.click();
  await expect(page.getByText('主管打回')).toBeVisible();
  await expect(page.getByText('需要补充或修改')).toBeVisible();
  coldItem = page.locator('[data-testid="inspection-item-3"]');
  await coldItem.getByRole('button', { name: '合格', exact: true }).click();
  const replacementChooserPromise = page.waitForEvent('filechooser');
  await coldItem.getByRole('button', { name: '已上传 1 张照片' }).click();
  const replacementChooser = await replacementChooserPromise;
  await replacementChooser.setFiles({
    name: 'nb001-cold-fridge-recheck.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2w==', 'base64'),
  });
  await page.getByTestId('submit-inspection').click();
  await expect(page.getByText('已提交：submitted，分数 100')).toBeVisible();

  await supervisor.getByRole('button', { name: '返回队列' }).click();
  const secondReview = supervisor
    .getByRole('button')
    .filter({ hasText: 'NB-001' })
    .filter({ hasText: 'Northbean Coffee 1' });
  await expect(secondReview).toContainText('100');
  await secondReview.click();
  await supervisor.getByRole('button', { name: '通过', exact: true }).click();
  await expect(supervisor.getByText('已通过', { exact: true })).toBeVisible();

  const hq = await page.context().newPage();
  await hq.goto(webUrl);
  await hq.getByLabel('邮箱').fill('hq@northbean.example');
  await hq.getByLabel('密码').fill(password);
  await hq.getByRole('button', { name: '登录' }).click();
  await expect(hq.getByRole('heading', { name: /总部看板/ })).toBeVisible();
  const nb001 = hq
    .getByRole('row')
    .filter({ has: hq.getByText('Northbean Coffee 1', { exact: true }) });
  await expect(nb001).toContainText('NB-001');
  await expect(nb001).toContainText('100');
});
