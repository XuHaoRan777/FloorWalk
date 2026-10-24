import { test, expect } from '@playwright/test';

for (const origin of ['http://127.0.0.1:3019', 'http://127.0.0.1:3020']) {
  test(`GET /api/me is readable from ${origin}`, async ({ page }) => {
    await page.goto(origin);
    const result = await page.evaluate(async () => {
      const response = await fetch('http://127.0.0.1:3018/api/me');
      return { status: response.status, body: await response.json() };
    });
    expect(result.status).toBe(401);
    expect(result.body.code).toBe('UNAUTHENTICATED');
  });
}
