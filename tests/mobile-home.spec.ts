import { test, expect } from '@playwright/test';

test('mobile home responds to the experience button', async ({ page }) => {
  let loaded = false;
  for (let attempt = 0; attempt < 20 && !loaded; attempt += 1) {
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 5000 });
      loaded = true;
    } catch (error) {
      if (attempt === 19) throw error;
      await page.waitForTimeout(1000);
    }
  }
  await page.getByRole('button', { name: '体验按钮' }).click();
  await expect(page.getByText('按钮响应成功')).toBeVisible();
  await page.screenshot({
    path: `docs/work/FW-003-contract-revision/evidence/t05-mobile-home-slot-${process.env.FW_SLOT}.png`,
    fullPage: true,
  });
});
