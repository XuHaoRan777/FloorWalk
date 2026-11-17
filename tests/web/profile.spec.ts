import { expect, test, type Page } from '@playwright/test';
import { buffer as consumeBuffer } from 'node:stream/consumers';
import type { CurrentUser } from '@libs/shared';
import { createPool } from '../../apps/api/src/db/client.js';
import { LocalStorageDriver } from '../../apps/api/src/storage/local.js';

const slot = Number(process.env.FW_SLOT);
const apiBase = 'http://127.0.0.1:' + (3100 + slot * 10) + '/api';
const avatarPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDZwAAAAASUVORK5CYII=',
  'base64',
);

type OriginalProfile = {
  id: string;
  displayName: string;
  avatarStorageKey: string | null;
  avatar?: { buffer: Buffer; mime: string };
};

async function openProfile(page: Page) {
  await page
    .getByLabel('控制台导航')
    .getByRole('button', { name: '我的', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: '我的', exact: true }),
  ).toBeVisible();
}

for (const account of [
  { loginName: 'hq@northbean.example', canRename: true },
  { loginName: 'manager2@northbean.example', canRename: false },
]) {
  test(
    'FW-035 AC-02/04/05 Web 个人资料：' + account.loginName,
    async ({ page }) => {
      const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
      databaseUrl.pathname = '/floorwalk_e2e_' + slot;
      const pool = createPool(databaseUrl.toString());
      const storage = new LocalStorageDriver(
        'apps/api/.e2e/slot-' + slot + '/storage',
      );
      const storageKeys: string[] = [];
      let original: OriginalProfile | undefined;

      try {
        await page.goto('/');
        await page
          .getByLabel('登录名', { exact: true })
          .fill(account.loginName);
        await page.getByLabel('密码').fill('northbean-demo');
        await page.getByRole('button', { name: '登录', exact: true }).click();
        await expect(page).toHaveURL(new RegExp('/console$'));

        const me = await page.request.get(apiBase + '/me');
        expect(me.status()).toBe(200);
        const current = (await me.json()) as CurrentUser;
        original = (
          await pool.query(
            'SELECT id, display_name AS "displayName", avatar_storage_key AS "avatarStorageKey" FROM floorwalk.users WHERE id = $1',
            [current.id],
          )
        ).rows[0] as OriginalProfile | undefined;
        expect(original).toBeTruthy();
        if (original?.avatarStorageKey) {
          const stored = await storage.get(original.avatarStorageKey);
          original.avatar = {
            buffer: await consumeBuffer(stored.stream),
            mime: stored.mime,
          };
        }

        await openProfile(page);
        const profile = page.locator('section').filter({
          has: page.getByRole('heading', { name: '我的', exact: true }),
        });
        await expect(
          profile.getByText('登录名（只读）', { exact: true }),
        ).toBeVisible();
        await expect(
          profile.getByText(current.loginName, { exact: true }),
        ).toBeVisible();
        await expect(
          profile.locator('dt').filter({ hasText: '角色' }).locator('+ dd'),
        ).toContainText(account.canRename ? '管理员' : '店长');
        await expect(
          profile.getByRole('link', { name: '改密码', exact: true }),
        ).toHaveAttribute('href', '/change-password');
        await expect(profile.getByRole('textbox')).toHaveCount(
          account.canRename ? 1 : 0,
        );

        const updatedName = 'FW-035 浏览器昵称';
        if (account.canRename) {
          await profile.getByLabel('昵称', { exact: true }).fill(updatedName);
          await profile.getByRole('button', { name: '保存昵称' }).click();
          await expect(profile.getByRole('status')).toHaveText('昵称已保存。');
        } else {
          await expect(
            profile.getByText(current.displayName, { exact: true }),
          ).toBeVisible();
          await expect(
            profile.getByRole('button', { name: '保存昵称' }),
          ).toHaveCount(0);
          expect(current.site).not.toBeNull();
          await expect(
            profile.getByText(current.site!.code + ' · ' + current.site!.name, {
              exact: true,
            }),
          ).toBeVisible();
        }

        const uploadResponse = page.waitForResponse(
          (response) =>
            response.url() === apiBase + '/me/avatar' &&
            response.request().method() === 'POST',
        );
        await profile.getByLabel('选择头像').setInputFiles({
          name: 'avatar.png',
          mimeType: 'image/png',
          buffer: avatarPng,
        });
        const uploaded = await uploadResponse;
        expect(uploaded.status()).toBe(201);
        const uploadedAvatar = (await uploaded.json()) as {
          storageKey: string;
        };
        storageKeys.push(uploadedAvatar.storageKey);
        await expect(profile.getByRole('status')).toHaveText('头像已更新。');

        const avatar = page.getByRole('img', { name: '当前头像', exact: true });
        await expect(avatar).toBeVisible();
        await expect
          .poll(() =>
            avatar.evaluate((node) => (node as HTMLImageElement).naturalWidth),
          )
          .toBeGreaterThan(0);
        const avatarPath = new URL((await avatar.getAttribute('src'))!)
          .pathname;

        await page.reload();
        await openProfile(page);
        await expect(avatar).toBeVisible();
        await expect
          .poll(() =>
            avatar.evaluate((node) => (node as HTMLImageElement).naturalWidth),
          )
          .toBeGreaterThan(0);
        expect(new URL((await avatar.getAttribute('src'))!).pathname).toBe(
          avatarPath,
        );
        if (account.canRename)
          await expect(profile.getByLabel('昵称', { exact: true })).toHaveValue(
            updatedName,
          );

        await profile
          .getByRole('button', { name: '退出登录', exact: true })
          .click();
        await expect(page).toHaveURL('/');
        await expect(page.getByLabel('登录名', { exact: true })).toBeVisible();
      } finally {
        try {
          await page.request
            .delete(apiBase + '/auth/session')
            .catch(() => undefined);
          if (original) {
            if (original.avatarStorageKey && original.avatar)
              await storage.put(
                original.avatarStorageKey,
                original.avatar.buffer,
                original.avatar.mime,
              );
            await pool.query(
              'UPDATE floorwalk.users SET display_name = $2, avatar_storage_key = $3 WHERE id = $1',
              [original.id, original.displayName, original.avatarStorageKey],
            );
          }
          for (const key of storageKeys) await storage.delete(key);
        } finally {
          await pool.end();
        }
      }
    },
  );
}
