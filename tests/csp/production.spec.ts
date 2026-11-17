import { expect, test } from '@playwright/test';
import type { CurrentUser, TaskReview } from '@libs/shared';
import { createPool } from '../../apps/api/src/db/client.js';
import { LocalStorageDriver } from '../../apps/api/src/storage/local.js';

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

test('FW-035 AC-04/05 production CSP allows evidence and refreshed avatars without violations', async ({
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

  await page.getByLabel('登录名', { exact: true }).fill('hq@northbean.example');
  await page.getByLabel('密码').fill('northbean-demo');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: /总部看板/ })).toBeVisible();

  const queueResponse = await page.request.get(`${apiOrigin}/api/review/tasks`);
  const queue = (await queueResponse.json()) as TaskReview[];
  const target = queue.find((task) =>
    task.items.some((item) => item.evidence.length),
  );
  expect(target).toBeTruthy();
  await page
    .getByLabel('控制台导航')
    .getByRole('button', { name: '审核队列', exact: true })
    .click();
  await page
    .getByRole('button')
    .filter({ hasText: target!.site.name })
    .filter({ hasText: target!.taskDate })
    .first()
    .click();
  const evidenceImage = page.locator('img').first();
  await expect(evidenceImage).toBeVisible();
  await expect
    .poll(() =>
      evidenceImage.evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);

  const profileResponse = await page.request.get(`${apiOrigin}/api/me`);
  const profile = (await profileResponse.json()) as CurrentUser;
  expect(profile.avatarUrl).toBeNull();
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  databaseUrl.pathname = `/floorwalk_e2e_${configuredSlot}`;
  const pool = createPool(databaseUrl.toString());
  const storage = new LocalStorageDriver(
    `apps/api/.e2e/slot-${configuredSlot}/storage`,
  );
  let avatarKey: string | undefined;
  try {
    await page
      .getByLabel('控制台导航')
      .getByRole('button', { name: '我的', exact: true })
      .click();
    const uploadResponse = page.waitForResponse(
      (uploaded) =>
        uploaded.url() === `${apiOrigin}/api/me/avatar` &&
        uploaded.request().method() === 'POST',
    );
    await page.getByLabel('选择头像').setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDZwAAAAASUVORK5CYII=',
        'base64',
      ),
    });
    const uploaded = await uploadResponse;
    expect(uploaded.status()).toBe(201);
    avatarKey = ((await uploaded.json()) as { storageKey: string }).storageKey;
    await expect(page.getByRole('status')).toHaveText('头像已更新。');
    await page.reload();
    await page
      .getByLabel('控制台导航')
      .getByRole('button', { name: '我的', exact: true })
      .click();
    const avatar = page.getByRole('img', { name: '当前头像', exact: true });
    await expect(avatar).toBeVisible();
    expect(new URL((await avatar.getAttribute('src'))!).origin).toBe(apiOrigin);
    await expect
      .poll(() =>
        avatar.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
  } finally {
    try {
      if (avatarKey) {
        await pool.query(
          'UPDATE floorwalk.users SET avatar_storage_key = NULL WHERE id = $1 AND avatar_storage_key = $2',
          [profile.id, avatarKey],
        );
        await storage.delete(avatarKey);
      }
      await page.request.delete(`${apiOrigin}/api/auth/session`);
    } finally {
      await pool.end();
    }
  }
  expect(
    await page.evaluate(
      () => (window as Window & { cspViolations?: string[] }).cspViolations,
    ),
  ).toEqual([]);
  expect(cspConsoleErrors).toEqual([]);
});
