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

test('a foreign origin cannot read responses or send writes', async ({
  request,
}) => {
  const foreignOrigin = 'http://127.0.0.1:3999';
  const get = await request.get(`${apiUrl}/me`, {
    headers: { Origin: foreignOrigin },
  });
  expect(get.status()).toBe(401);
  expect(get.headers()['access-control-allow-origin']).toBeUndefined();
  const write = await request.post(`${apiUrl}/auth/session`, {
    headers: { Origin: foreignOrigin },
    data: {
      email: 'supervisor@northbean.example',
      password: 'northbean-demo',
    },
  });
  expect(write.status()).toBe(403);
  expect(await write.json()).toMatchObject({ code: 'FORBIDDEN' });
});

test('a write without Origin remains available to native and server clients', async ({
  request,
}) => {
  const response = await request.post(`${apiUrl}/auth/session`, {
    data: { email: 'supervisor@northbean.example', password: 'northbean-demo' },
  });
  expect(response.status()).toBe(201);
  await request.delete(`${apiUrl}/auth/session`);
});
