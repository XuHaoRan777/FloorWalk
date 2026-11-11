import { expect, test } from '@playwright/test';

test('注册入口与首次改密表单路由', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '注册商家' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole('heading', { name: '注册商家' })).toBeVisible();
  await expect(page.getByLabel('商家名称')).toBeVisible();
  await expect(page.getByLabel('管理员姓名')).toBeVisible();
  await expect(page.getByLabel('邮箱', { exact: true })).toBeVisible();
  await expect(page.getByLabel('密码')).toBeVisible();
  await page.getByRole('link', { name: '返回登录' }).click();
  await expect(page.getByLabel('登录名')).toBeVisible();

  await page.goto('/change-password');
  await expect(page.getByRole('heading', { name: '修改密码' })).toBeVisible();
  await expect(page.getByLabel('当前密码')).toBeVisible();
  await expect(page.getByLabel('新密码', { exact: true })).toBeVisible();
  await expect(page.getByLabel('确认新密码')).toBeVisible();
  await expect(page.getByRole('button', { name: '保存新密码' })).toBeVisible();
});

for (const account of [
  { loginName: 'hq@northbean.example', canManage: true },
  { loginName: 'inspector+nb-002@northbean.example', canManage: false },
]) {
  test(`FW-020 AC-08 账号分区可见性：${account.loginName}`, async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByLabel('登录名').fill(account.loginName);
    await page.getByLabel('密码').fill('northbean-demo');
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page).toHaveURL(/\/console$/);
    const usersButton = page.getByRole('button', { name: '账号', exact: true });
    if (account.canManage) {
      await usersButton.click();
      await expect(page.getByRole('heading', { name: '账号' })).toBeVisible();
      await expect(page.getByLabel('昵称')).toBeVisible();
      await expect(page.getByLabel('登录名（手机号或邮箱）')).toBeVisible();
      await expect(page.getByLabel('初始密码')).toBeVisible();
      await expect(
        page.getByRole('button', { name: '创建店长' }),
      ).toBeVisible();
    } else {
      await expect(page.getByText('请使用手机端')).toBeVisible();
      await expect(usersButton).toHaveCount(0);
    }
  });
}
