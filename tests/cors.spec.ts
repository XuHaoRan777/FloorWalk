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

const apiUrl = `http://127.0.0.1:${apiPort}/api`;
const allowedOrigins = [webPort, metroPort].map(
  (port) => `http://127.0.0.1:${port}`,
);

for (const origin of allowedOrigins) {
  test(`credentialed login and /api/me are readable from ${origin}`, async ({
    page,
  }) => {
    await page.route(`${origin}/**`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>CORS origin</title>',
      }),
    );
    await page.goto(origin);
    const result = await page.evaluate(async (baseUrl) => {
      const login = await fetch(`${baseUrl}/auth/session`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'supervisor@northbean.example',
          password: 'northbean-demo',
        }),
      });
      const me = await fetch(`${baseUrl}/me`, { credentials: 'include' });
      const user = await me.json();
      return {
        loginStatus: login.status,
        meStatus: me.status,
        role: user.role,
      };
    }, apiUrl);
    expect(result).toEqual({
      loginStatus: 201,
      meStatus: 200,
      role: 'supervisor',
    });
    await page.evaluate(async (baseUrl) => {
      await fetch(`${baseUrl}/auth/session`, {
        method: 'DELETE',
        credentials: 'include',
      });
    }, apiUrl);
  });
}

test('a non-allowlisted origin cannot read a credentialed API response', async ({
  page,
}) => {
  const allowedOrigin = allowedOrigins[0];
  const foreignOrigin = 'http://127.0.0.1:3999';
  for (const origin of [allowedOrigin, foreignOrigin]) {
    await page.route(`${origin}/**`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>CORS origin</title>',
      }),
    );
  }
  await page.goto(allowedOrigin);
  const loginStatus = await page.evaluate(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/session`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'supervisor@northbean.example',
        password: 'northbean-demo',
      }),
    });
    return response.status;
  }, apiUrl);
  expect(loginStatus).toBe(201);
  await page.goto(foreignOrigin);
  const result = await page.evaluate(async (baseUrl) => {
    try {
      await fetch(`${baseUrl}/me`, { credentials: 'include' });
      return 'readable';
    } catch (error) {
      return error instanceof TypeError ? 'blocked' : 'unexpected error';
    }
  }, apiUrl);
  expect(result).toBe('blocked');
  await page.goto(allowedOrigin);
  await page.evaluate(async (baseUrl) => {
    await fetch(`${baseUrl}/auth/session`, {
      method: 'DELETE',
      credentials: 'include',
    });
  }, apiUrl);
});
