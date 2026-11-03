import { expect, test } from '@playwright/test';

test('AC-06 注册入口与注册、改密码空页路由', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '注册商家' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole('heading', { name: '注册商家' })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.screenshot({
    path: 'docs/work/FW-017-g03-protocol/evidence/register.png',
  });
  await page.getByRole('link', { name: '返回登录' }).click();
  await expect(page.getByLabel('邮箱')).toBeVisible();

  await page.goto('/change-password');
  await expect(page.getByRole('heading', { name: '修改密码' })).toBeVisible();
  await expect(page.locator('input')).toHaveCount(0);
  await page.screenshot({
    path: 'docs/work/FW-017-g03-protocol/evidence/web-password.png',
  });
  await expect(page.getByRole('link', { name: '返回工作台' })).toHaveAttribute(
    'href',
    '/console',
  );
});

for (const account of [
  { email: 'hq@northbean.example', canManage: true },
  { email: 'supervisor@northbean.example', canManage: true },
  { email: 'inspector@northbean.example', canManage: false },
]) {
  test(`AC-06 账号分区可见性：${account.email}`, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('邮箱').fill(account.email);
    await page.getByLabel('密码').fill('northbean-demo');
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page).toHaveURL(/\/console$/);
    const usersButton = page.getByRole('button', { name: '账号', exact: true });
    if (account.canManage) {
      await usersButton.click();
      await expect(page.getByRole('heading', { name: '账号' })).toBeVisible();
      await expect(page.locator('main input')).toHaveCount(0);
      if (account.email === 'hq@northbean.example') {
        await page.screenshot({
          path: 'docs/work/FW-017-g03-protocol/evidence/users.png',
        });
      }
    } else {
      await expect(page.getByText('请使用手机端')).toBeVisible();
      await expect(usersButton).toHaveCount(0);
    }
  });
}
