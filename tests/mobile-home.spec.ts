import { test, expect } from '@playwright/test';

test('mobile home responds to the experience button', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '体验按钮' }).click();
  await expect(page.getByText('按钮响应成功')).toBeVisible();
  await page.screenshot({
    path: 'docs/work/FW-002-inspection-contract/evidence/t01-mobile-home.png',
    fullPage: true,
  });
});
