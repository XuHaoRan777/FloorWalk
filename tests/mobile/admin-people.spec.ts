import { expect, test } from '@playwright/test';
import type { AdminUser, Site } from '@libs/shared';
import { cleanupPeople, loginAdmin, saveAdmin } from './admin-fixtures';

test('AC-02、AC-03 账号和门店的完整配置与刷新持久化', async ({ page }) => {
  const userIds: string[] = [];
  const siteIds: string[] = [];
  try {
    await loginAdmin(page);
    await page.getByTestId('admin-entry-sites').click();
    const sites: Site[] = [];
    for (const index of [1, 2]) {
      await page.getByRole('button', { name: '新建门店', exact: true }).click();
      await page
        .getByLabel('门店编码', { exact: true })
        .fill(`FW033-${Date.now()}-${index}`);
      await page
        .getByLabel('门店名称', { exact: true })
        .fill(`移动测试店${index}`);
      const site = await saveAdmin<Site>(
        page,
        '/admin/sites',
        'POST',
        '创建门店',
      );
      siteIds.push(site.id);
      sites.push(site);
      await expect(page.getByTestId(`site-${site.id}`)).toContainText(
        site.name,
      );
    }
    const firstSite = page.getByTestId(`site-${sites[0].id}`);
    await firstSite.getByRole('button', { name: '改名', exact: true }).click();
    await page.getByLabel('门店名称', { exact: true }).fill('移动测试店已改名');
    const staleRead = Promise.withResolvers<Site[]>();
    const releaseRead = Promise.withResolvers<void>();
    await page.route(
      '**/api/admin/sites',
      async (route) => {
        const response = await route.fetch();
        staleRead.resolve((await response.json()) as Site[]);
        await releaseRead.promise;
        await route.fulfill({ response });
      },
      { times: 1 },
    );
    try {
      const refreshed = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/admin/sites') &&
          response.request().method() === 'GET',
      );
      await page.getByRole('button', { name: '刷新', exact: true }).click();
      const oldSites = await staleRead.promise;
      expect(oldSites.find((site) => site.id === sites[0].id)?.name).toBe(
        sites[0].name,
      );
      const renamed = await saveAdmin<Site>(
        page,
        `/admin/sites/${sites[0].id}`,
        'PATCH',
        '保存名称',
      );
      expect(renamed.name).toBe('移动测试店已改名');
      await expect(firstSite).toContainText('移动测试店已改名');
      releaseRead.resolve();
      await (await refreshed).finished();
      await expect(
        page.getByRole('button', { name: '刷新', exact: true }),
      ).toBeEnabled();
      await expect(firstSite).toContainText('移动测试店已改名');
      await firstSite
        .getByRole('button', { name: '改名', exact: true })
        .click();
      await expect(page.getByLabel('门店名称', { exact: true })).toHaveValue(
        '移动测试店已改名',
      );
      await page.getByRole('button', { name: '取消编辑', exact: true }).click();
    } finally {
      releaseRead.resolve();
    }
    await firstSite.getByRole('button', { name: '停用', exact: true }).click();
    await firstSite
      .getByRole('button', { name: '确认停用', exact: true })
      .click();
    await expect(firstSite).toContainText('已停用');
    await firstSite
      .getByRole('button', { name: '重新启用', exact: true })
      .click();
    await firstSite
      .getByRole('button', { name: '确认重新启用', exact: true })
      .click();
    await expect(firstSite).not.toContainText('已停用');

    await page.getByRole('button', { name: '返回管理主页' }).click();
    await page.getByTestId('admin-entry-accounts').click();
    await page.getByRole('button', { name: '新建店长', exact: true }).click();
    const loginName = `fw033-${Date.now()}@example.test`;
    await page.getByLabel('昵称', { exact: true }).fill('移动新店长');
    await page
      .getByLabel('登录名（手机号或邮箱）', { exact: true })
      .fill(loginName);
    await page.getByLabel('门店', { exact: true }).selectOption(sites[0].id);
    await page
      .getByLabel('初始密码（至少 8 位）', { exact: true })
      .fill('mobile-demo-123');
    const user = await saveAdmin<AdminUser>(
      page,
      '/admin/users',
      'POST',
      '创建店长',
    );
    userIds.push(user.id);
    const card = page.getByTestId(`account-${user.id}`);
    await expect(card).toContainText('移动新店长');
    await expect(card).toContainText('移动测试店已改名');
    await card.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByLabel('昵称', { exact: true }).fill('移动改名店长');
    await page.getByLabel('门店', { exact: true }).selectOption(sites[1].id);
    const updated = await saveAdmin<AdminUser>(
      page,
      `/admin/users/${user.id}`,
      'PATCH',
      '保存账号',
    );
    expect(updated.displayName).toBe('移动改名店长');
    expect(updated.site?.id).toBe(sites[1].id);
    await card.getByRole('button', { name: '停用', exact: true }).click();
    await card.getByRole('button', { name: '确认停用', exact: true }).click();
    await expect(card).toContainText('已停用');
    await card.getByRole('button', { name: '重新启用', exact: true }).click();
    await card
      .getByRole('button', { name: '确认重新启用', exact: true })
      .click();
    await expect(card).not.toContainText('已停用');
    await card.getByRole('button', { name: '重置密码', exact: true }).click();
    await page
      .getByLabel('新密码（至少 8 位）', { exact: true })
      .fill('reset-mobile-123');
    const reset = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/admin/users/${user.id}/password`) &&
        response.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: '确认重置密码', exact: true })
      .click();
    expect((await reset).ok()).toBeTruthy();
    await expect(
      page.getByText('密码已重置，下次登录需修改密码。', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(card).toContainText('移动改名店长');
    await expect(card).toContainText(sites[1].name);
    await expect(card).toContainText('待首次改密');
    await page.getByRole('button', { name: '返回管理主页' }).click();
    await page.getByTestId('admin-entry-sites').click();
    await expect(page.getByTestId(`site-${sites[1].id}`)).toContainText(
      '店长：移动改名店长',
    );
    await expect(firstSite).toContainText('店长：暂无店长');
  } finally {
    await cleanupPeople(userIds, siteIds);
  }
});
