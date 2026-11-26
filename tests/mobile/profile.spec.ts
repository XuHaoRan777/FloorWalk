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

async function avatarPath(page: Page) {
  const avatar = page.getByTestId('profile-avatar');
  await expect(avatar).toBeVisible();
  await expect
    .poll(() =>
      avatar.evaluate((node) => {
        const image =
          node instanceof HTMLImageElement ? node : node.querySelector('img');
        return image?.naturalWidth ?? 0;
      }),
    )
    .toBeGreaterThan(0);
  const source = await avatar.evaluate((node) => {
    const image =
      node instanceof HTMLImageElement ? node : node.querySelector('img');
    return image?.src ?? '';
  });
  return new URL(source).pathname;
}

for (const account of [
  { loginName: 'hq@northbean.example', canRename: true },
  { loginName: 'manager2@northbean.example', canRename: false },
]) {
  test(
    'FW-035 AC-04/05 Mobile Web 个人资料：' + account.loginName,
    async ({ page }) => {
      const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
      databaseUrl.pathname = '/floorwalk_e2e_' + slot;
      const pool = createPool(databaseUrl.toString());
      const storage = new LocalStorageDriver(
        'apps/api/.e2e/slot-' + slot + '/storage',
      );
      const storageKeys = new Set<string>();
      let original: OriginalProfile | undefined;

      try {
        await page.goto('/');
        await page
          .getByLabel('登录名', { exact: true })
          .fill(account.loginName);
        await page.getByLabel('密码', { exact: true }).fill('northbean-demo');
        await page.getByTestId('login-button').click();
        if (account.canRename) {
          await expect(
            page.getByRole('heading', { name: '今日门店' }),
          ).toBeVisible();
        } else {
          await expect(
            page.getByRole('tab', { name: '今日待巡' }),
          ).toBeVisible();
        }

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

        await page
          .getByRole('tab', { name: account.canRename ? '个人资料' : '我的' })
          .click();
        await expect(
          page.getByRole('heading', {
            name: '我的',
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: '刷新资料', exact: true }),
        ).toBeEnabled();
        await expect(
          page.getByText('登录名（只读）', { exact: true }),
        ).toBeVisible();
        await expect(page.getByLabel('当前登录名', { exact: true })).toHaveText(
          current.loginName,
        );
        await expect(page.getByLabel('当前昵称', { exact: true })).toHaveText(
          current.displayName,
        );
        await expect(page.getByLabel('当前角色', { exact: true })).toHaveText(
          account.canRename ? '管理员' : '店长',
        );
        await expect(
          page.getByRole('button', {
            name: '修改密码',
            exact: true,
          }),
        ).toBeEnabled();
        await expect(page.getByRole('textbox')).toHaveCount(0);

        const updatedName = 'FW-035 Mobile 昵称';
        if (account.canRename) {
          await page.getByRole('button', { name: '编辑昵称' }).click();
          await page.getByLabel('昵称', { exact: true }).fill(updatedName);
          await page.getByRole('button', { name: '保存昵称' }).click();
          await expect(
            page.getByText('昵称已保存。', { exact: true }),
          ).toBeVisible();
          await expect(page.getByLabel('当前昵称', { exact: true })).toHaveText(
            updatedName,
          );
        } else {
          await expect(
            page.getByRole('button', { name: '编辑昵称' }),
          ).toHaveCount(0);
          expect(current.site).not.toBeNull();
          await expect(page.getByLabel('当前门店', { exact: true })).toHaveText(
            current.site!.name,
          );
        }

        const uploadResponse = page.waitForResponse(
          (response) =>
            response.url() === apiBase + '/me/avatar' &&
            response.request().method() === 'POST',
        );
        const fileChooser = page.waitForEvent('filechooser');
        await page.getByTestId('profile-change-avatar').click();
        await (
          await fileChooser
        ).setFiles({
          name: 'avatar.png',
          mimeType: 'image/png',
          buffer: avatarPng,
        });
        const uploaded = await uploadResponse;
        expect(uploaded.status()).toBe(201);
        const uploadedAvatar = (await uploaded.json()) as {
          storageKey: string;
        };
        storageKeys.add(uploadedAvatar.storageKey);
        await expect(
          page.getByText('头像已更新。', { exact: true }),
        ).toBeVisible();
        const beforeReload = await avatarPath(page);

        await page.reload();
        await expect(
          page.getByRole('heading', {
            name: '我的',
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: '刷新资料', exact: true }),
        ).toBeEnabled();
        expect(await avatarPath(page)).toBe(beforeReload);
        await expect(page.getByLabel('当前昵称', { exact: true })).toHaveText(
          account.canRename ? updatedName : current.displayName,
        );
        await page
          .getByRole('button', { name: '退出登录', exact: true })
          .click();
        await expect(page.getByTestId('login-button')).toBeVisible();
      } finally {
        try {
          await page.request
            .delete(apiBase + '/auth/session')
            .catch(() => undefined);
          if (original) {
            const latest = await pool.query<{
              avatarStorageKey: string | null;
            }>(
              'SELECT avatar_storage_key AS "avatarStorageKey" FROM floorwalk.users WHERE id = $1',
              [original.id],
            );
            const latestKey = latest.rows[0]?.avatarStorageKey;
            if (latestKey && latestKey !== original.avatarStorageKey) {
              storageKeys.add(latestKey);
            }
            if (original.avatarStorageKey && original.avatar) {
              await storage.put(
                original.avatarStorageKey,
                original.avatar.buffer,
                original.avatar.mime,
              );
            }
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
    'FW-035 AC-03/05 Mobile Web 主动改密与其他会话登出：' + account.loginName,
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
      const changedPassword = 'fw035-mobile-profile-password';
      const openProfile = async (target: Page) => {
        await target
          .getByRole('tab', { name: account.canRename ? '个人资料' : '我的' })
          .click();
        await expect(
          target.getByRole('heading', {
            name: '我的',
            exact: true,
          }),
        ).toBeVisible();
      };
      const login = async (target: Page) => {
        await target.goto('/');
        await target
          .getByLabel('登录名', { exact: true })
          .fill(account.loginName);
        await target.getByLabel('密码', { exact: true }).fill('northbean-demo');
        await target.getByTestId('login-button').click();
        if (account.canRename) {
          await expect(
            target.getByRole('heading', { name: '今日门店' }),
          ).toBeVisible();
        } else {
          await expect(
            target.getByRole('tab', { name: '今日待巡' }),
          ).toBeVisible();
        }
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
        await page
          .getByRole('button', {
            name: '修改密码',
            exact: true,
          })
          .click();
        await expect(
          page.getByRole('heading', { name: '修改密码', exact: true }),
        ).toBeVisible();
        await page
          .getByLabel('当前密码', { exact: true })
          .fill('northbean-demo');
        await page.getByLabel('新密码', { exact: true }).fill(changedPassword);
        await page
          .getByLabel('确认新密码', { exact: true })
          .fill(changedPassword);
        await page.getByRole('button', { name: '保存新密码' }).click();
        if (account.canRename) {
          await expect(
            page.getByRole('heading', { name: '今日门店' }),
          ).toBeVisible();
        } else {
          await expect(
            page.getByRole('tab', { name: '今日待巡' }),
          ).toBeVisible();
        }

        await otherPage.reload();
        await expect(otherPage.getByTestId('login-button')).toBeVisible();
        await expect(
          otherPage.getByLabel('登录名', { exact: true }),
        ).toBeVisible();

        await page.reload();
        await openProfile(page);
        await expect(page.getByLabel('当前登录名', { exact: true })).toHaveText(
          account.loginName,
        );
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
