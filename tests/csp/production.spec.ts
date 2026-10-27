import { expect, test } from '@playwright/test';

const configuredSlot = Number(process.env.FW_SLOT);
const apiPort = 3100 + configuredSlot * 10;
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const expectedPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: ${apiOrigin}`,
  `connect-src 'self' ${apiOrigin}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

test('production build/preview CSP allows login and evidence images without violations', async ({
  page,
}) => {
  const cspConsoleErrors: string[] = [];
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      message.text().includes('Content Security Policy') &&
      !message.text().includes("'frame-ancestors' is ignored")
    ) {
      cspConsoleErrors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    const target = window as Window & { cspViolations?: string[] };
    target.cspViolations = [];
    window.addEventListener('securitypolicyviolation', (event) => {
      target.cspViolations?.push(event.violatedDirective);
    });
  });

  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toBe(expectedPolicy);
  await expect(
    page.locator('meta[http-equiv="Content-Security-Policy"]'),
  ).toHaveAttribute('content', expectedPolicy);

  await page.getByLabel('邮箱').fill('supervisor@northbean.example');
  await page.getByLabel('密码').fill('northbean-demo');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page.getByRole('heading', { name: /审核队列/ })).toBeVisible();

  await page
    .getByRole('button')
    .filter({ hasText: 'Northbean Coffee 4' })
    .click();
  const evidenceImage = page.locator('img').first();
  await expect(evidenceImage).toBeVisible();
  await expect
    .poll(() =>
      evidenceImage.evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => (window as Window & { cspViolations?: string[] }).cspViolations,
    ),
  ).toEqual([]);
  expect(cspConsoleErrors).toEqual([]);
});
