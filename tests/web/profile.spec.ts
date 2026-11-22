import { expect, test, type BrowserContext, type Page } from '@playwright/test';
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
  await page.locator('.fw-sidebar-user > summary').click();
  await page.getByRole('button', { name: '账户设置', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '账户设置', exact: true }),
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
          has: page.getByRole('heading', { name: '账户设置', exact: true }),
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

        await page.locator('.fw-sidebar-user > summary').click();
        await page
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

  test(
    'FW-035 AC-03/05 Web 主动改密与其他会话登出：' + account.loginName,
    async ({ browser, page }) => {
      const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
      databaseUrl.pathname = '/floorwalk_e2e_' + slot;
      const pool = createPool(databaseUrl.toString());
      let original:
        | {
            id: string;
            passwordHash: string;
            mustChangePassword: boolean;
          }
        | undefined;
      let originalSessionHashes: string[] | undefined;
      let otherContext: BrowserContext | undefined;
      const changedPassword = 'fw035-web-profile-password';
      const login = async (target: Page) => {
        await target.goto('/');
        await target
          .getByLabel('登录名', { exact: true })
          .fill(account.loginName);
        await target.getByLabel('密码', { exact: true }).fill('northbean-demo');
        await target.getByRole('button', { name: '登录', exact: true }).click();
        await expect(target).toHaveURL(new RegExp('/console$'));
      };

      try {
        original = (
          await pool.query(
            'SELECT id, password_hash AS "passwordHash", must_change_password AS "mustChangePassword" FROM floorwalk.users WHERE login_name = $1',
            [account.loginName],
          )
        ).rows[0];
        if (!original) throw new Error('缺少个人中心测试的种子账号。');
        expect(original.mustChangePassword).toBe(false);
        const originalSessions = (
          await pool.query(
            'SELECT token_hash FROM floorwalk.sessions WHERE user_id = $1',
            [original.id],
          )
        ).rows as { token_hash: string }[];
        originalSessionHashes = originalSessions.map((row) => row.token_hash);

        await login(page);
        otherContext = await browser.newContext({
          baseURL: new URL('/', page.url()).toString(),
        });
        const otherPage = await otherContext.newPage();
        await login(otherPage);
        await openProfile(otherPage);

        await openProfile(page);
        await page.getByRole('link', { name: '改密码', exact: true }).click();
        await expect(page).toHaveURL(new RegExp('/change-password$'));
        await page
          .getByLabel('当前密码', { exact: true })
          .fill('northbean-demo');
        await page.getByLabel('新密码', { exact: true }).fill(changedPassword);
        await page
          .getByLabel('确认新密码', { exact: true })
          .fill(changedPassword);
        await page.getByRole('button', { name: '保存新密码' }).click();
        await expect(page).toHaveURL(new RegExp('/console$'));

        await otherPage.reload();
        await expect(
          otherPage.getByLabel('登录名', { exact: true }),
        ).toBeVisible();
        await expect(otherPage).toHaveURL(new URL('/', page.url()).toString());

        await page.reload();
        await openProfile(page);
        const profile = page.locator('section').filter({
          has: page.getByRole('heading', { name: '账户设置', exact: true }),
        });
        await expect(
          profile.getByText(account.loginName, { exact: true }),
        ).toBeVisible();
      } finally {
        try {
          if (original) {
            await pool.query(
              'UPDATE floorwalk.users SET password_hash = $2, must_change_password = $3 WHERE id = $1',
              [original.id, original.passwordHash, original.mustChangePassword],
            );
            if (originalSessionHashes) {
              await pool.query(
                'DELETE FROM floorwalk.sessions WHERE user_id = $1 AND NOT (token_hash = ANY($2::text[]))',
                [original.id, originalSessionHashes],
              );
            }
          }
        } finally {
          try {
            await otherContext?.close();
          } finally {
            await pool.end();
          }
        }
      }
    },
  );
}
