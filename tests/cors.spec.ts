import { test, expect } from '@playwright/test';

const configuredSlot = process.env.FW_SLOT;
if (!configuredSlot) {
  throw new Error('FW_SLOT 未设置；请设置为 1、2 或 3。');
}
const slot = Number(configuredSlot);
if (!Number.isInteger(slot) || slot < 1 || slot > 3) {
  throw new Error('FW_SLOT 必须是 1、2 或 3。');
}
const apiPort = 3100 + slot * 10;
const webPort = apiPort + 1;
const metroPort = apiPort + 2;

for (const origin of [webPort, metroPort].map((port) => `http://127.0.0.1:${port}`)) {
  test(`GET /api/me is readable from ${origin}`, async ({ page }) => {
    await page.goto(origin);
    const result = await page.evaluate(async (apiUrl) => {
      const response = await fetch(apiUrl);
      return { status: response.status, body: await response.json() };
    }, `http://127.0.0.1:${apiPort}/api/me`);
    expect(result.status).toBe(401);
    expect(result.body.code).toBe('UNAUTHENTICATED');
  });
}
