import { expect, test } from '@playwright/test';

test('AC-06 手机端改密码空页路由与返回', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('邮箱').fill('inspector@northbean.example');
  await page.getByLabel('密码').fill('northbean-demo');
  await page.getByTestId('login-button').click();
  await expect(page.getByRole('tab', { name: '今日待巡' })).toBeVisible();

  await page.goto('/change-password');
  await expect(page.getByRole('heading', { name: '修改密码' })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.screenshot({
    path: 'docs/work/FW-017-g03-protocol/evidence/mobile-password.png',
  });
  await page.getByRole('button', { name: '返回我的' }).click();
  await expect(page.getByRole('heading', { name: '账号信息' })).toBeVisible();
});
