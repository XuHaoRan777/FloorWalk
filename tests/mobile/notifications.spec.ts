import { expect, test, request as playwrightRequest } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createPool } from '../../apps/api/src/db/client.js';
import { createReviewFixture } from './review-fixtures';
import { apiBase } from './admin-fixtures';

const slot = Number(process.env.FW_SLOT);
const password = 'northbean-demo';

function testPool() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.pathname = `/floorwalk_e2e_${slot}`;
  return createPool(url.toString());
}

async function login(page: import('@playwright/test').Page, loginName: string) {
  await page.goto('/');
  await page.getByLabel('登录名', { exact: true }).fill(loginName);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByTestId('login-button').click();
}

async function resumeApp(page: import('@playwright/test').Page) {
  const changeVisibility = (state: DocumentVisibilityState) =>
    page.evaluate((nextState) => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: nextState,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
  await changeVisibility('hidden');
  await changeVisibility('visible');
}

test('店长从通知角标打开打回条目并清零未读', async ({ page }) => {
  const admin = await playwrightRequest.newContext();
  let fixture: Awaited<ReturnType<typeof createReviewFixture>> | undefined;
  let releaseCountResponse: (() => void) | undefined;
  try {
    const adminLogin = await admin.post(`${apiBase}/auth/session`, {
      data: { loginName: 'hq@northbean.example', password },
    });
    expect(adminLogin.status()).toBe(201);
    fixture = await createReviewFixture(admin, apiBase);
    expect((await fixture.upload(1, '按要求提交检查照片。')).status()).toBe(
      201,
    );
    expect((await fixture.upload(2, '已核对现场记录。')).status()).toBe(201);
    await fixture.waitForManual();

    const reviewResponse = await admin.get(
      `${apiBase}/tasks/${fixture.taskId}/review`,
    );
    expect(reviewResponse.status()).toBe(200);
    const review = (await reviewResponse.json()) as {
      items: Array<{ id: string; position: number }>;
    };
    const firstItem = review.items.find((item) => item.position === 1);
    expect(firstItem).toBeTruthy();
    if (!firstItem) throw new Error('测试任务缺少第一项。');
    const rework = await admin.post(
      `${apiBase}/tasks/${fixture.taskId}/items/${firstItem.id}/decision`,
      { data: { result: 'rework', reason: '请补充第一项现场照片。' } },
    );
    expect(rework.status()).toBe(201);

    await page.goto('/');
    await page
      .getByLabel('登录名', { exact: true })
      .fill(fixture.managerLoginName);
    await page
      .getByLabel('密码', { exact: true })
      .fill(fixture.managerPassword);
    await page.getByTestId('login-button').click();
    const notificationTab = page.getByRole('tab', { name: '通知' });
    await expect(notificationTab).toBeVisible();
    await expect(notificationTab).toContainText('1');
    await notificationTab.click();
    await expect(
      page.getByRole('heading', { name: '通知', exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('notification-section-unread')).toBeVisible();
    await page.route('**/api/me/notifications/unread-count', async (route) => {
      const response = await route.fetch();
      expect((await response.json()).count).toBe(1);
      await new Promise<void>((resolve) => {
        releaseCountResponse = resolve;
      });
      await route.fulfill({ response });
    });
    await resumeApp(page);
    await expect.poll(() => Boolean(releaseCountResponse)).toBe(true);
    await page
      .getByRole('button', { name: /检查项被打回.*请补充第一项现场照片/ })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/inspection/${fixture.taskId}\\?position=1$`),
    );
    await expect(page.getByTestId('task-detail-screen')).toBeVisible();
    await expect(page.getByTestId('task-item-1')).toBeVisible();
    await expect(page.getByTestId('task-item-1')).toHaveClass(/border-accent/);
    const unread = await page.request.get(
      `${apiBase}/me/notifications/unread-count`,
    );
    expect((await unread.json()).count).toBe(0);
    const delayedCountResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/me/notifications/unread-count'),
    );
    releaseCountResponse?.();
    await (await delayedCountResponse).finished();
    await page.goBack();
    await expect(notificationTab).toBeVisible();
    await expect(notificationTab).not.toContainText('1');
  } finally {
    releaseCountResponse?.();
    await fixture?.cleanup();
    await admin.delete(`${apiBase}/auth/session`).catch(() => undefined);
    await admin.dispose();
  }
});

test('另一商家的店长收件箱不显示本商家通知', async ({ page }) => {
  const pool = testPool();
  const notificationId = randomUUID();
  try {
    const owner = await pool.query<{
      id: string;
      orgId: string;
    }>(
      `SELECT id, org_id AS "orgId" FROM floorwalk.users
       WHERE login_name = 'manager2@northbean.example'`,
    );
    expect(owner.rows[0]).toBeTruthy();
    const taskId = randomUUID();
    await pool.query(
      `INSERT INTO floorwalk.notifications
         (id, org_id, user_id, type, payload_json)
       VALUES ($1, $2, $3, 'task_overdue', $4::jsonb)`,
      [
        notificationId,
        owner.rows[0].orgId,
        owner.rows[0].id,
        JSON.stringify({ taskId }),
      ],
    );

    await login(page, 'inspector@northbean.example');
    await page.getByRole('button', { name: '演示二号', exact: true }).click();
    await expect(page.getByRole('tab', { name: '今日待巡' })).toBeVisible();
    await page.getByRole('tab', { name: '通知' }).click();
    await expect(page.getByText('暂无通知')).toBeVisible();
    const count = await page.request.get(
      `${apiBase}/me/notifications/unread-count`,
    );
    expect((await count.json()).count).toBe(0);
  } finally {
    await pool.query('DELETE FROM floorwalk.notifications WHERE id = $1', [
      notificationId,
    ]);
    await pool.end();
  }
});

test('前台恢复只刷新一次、切 Tab 不重复拉取且角标封顶 99+', async ({
  page,
}) => {
  const pool = testPool();
  const ids: string[] = [];
  let unreadCountRequests = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'GET' &&
      request.url().includes('/api/me/notifications/unread-count')
    )
      unreadCountRequests += 1;
  });
  try {
    const owner = await pool.query<{ id: string; orgId: string }>(
      `SELECT id, org_id AS "orgId" FROM floorwalk.users
       WHERE login_name = 'manager2@northbean.example'`,
    );
    expect(owner.rows[0]).toBeTruthy();
    await login(page, 'manager2@northbean.example');
    await expect(page.getByRole('tab', { name: '通知' })).toBeVisible();
    await expect.poll(() => unreadCountRequests).toBeGreaterThan(0);
    const initialRequests = unreadCountRequests;

    const insertNotifications = async (count: number) => {
      const batch = Array.from({ length: count }, () => randomUUID());
      ids.push(...batch);
      await pool.query(
        `INSERT INTO floorwalk.notifications
           (id, org_id, user_id, type, payload_json)
         SELECT inserted.notification_id, $1, $2, 'task_overdue', $4::jsonb
         FROM unnest($3::uuid[]) AS inserted(notification_id)`,
        [
          owner.rows[0].orgId,
          owner.rows[0].id,
          batch,
          JSON.stringify({ taskId: randomUUID() }),
        ],
      );
    };
    await insertNotifications(1);
    await resumeApp(page);
    await expect(page.getByRole('tab', { name: '通知' })).toContainText('1');
    await expect.poll(() => unreadCountRequests).toBe(initialRequests + 1);
    await page.getByRole('tab', { name: '我的' }).click();
    await page.getByRole('tab', { name: '通知' }).click();
    await expect.poll(() => unreadCountRequests).toBe(initialRequests + 1);

    await insertNotifications(100);
    await resumeApp(page);
    await expect(page.getByRole('tab', { name: '通知' })).toContainText('99+');
    await expect.poll(() => unreadCountRequests).toBe(initialRequests + 2);
  } finally {
    if (ids.length)
      await pool.query(
        'DELETE FROM floorwalk.notifications WHERE id = ANY($1::uuid[])',
        [ids],
      );
    await pool.end();
  }
});

test('收件箱按状态分组并使用游标加载下一页', async ({ page }) => {
  const pool = testPool();
  const ids = Array.from({ length: 51 }, () => randomUUID());
  let cursorRequests = 0;
  page.on('request', (request) => {
    if (request.method() !== 'GET') return;
    const url = new URL(request.url());
    if (url.searchParams.has('after')) cursorRequests += 1;
  });
  try {
    const owner = await pool.query<{ id: string; orgId: string }>(
      `SELECT id, org_id AS "orgId" FROM floorwalk.users
       WHERE login_name = 'manager2@northbean.example'`,
    );
    expect(owner.rows[0]).toBeTruthy();
    await pool.query(
      `INSERT INTO floorwalk.notifications
         (id, org_id, user_id, type, payload_json, created_at, read_at)
       SELECT item.notification_id, $1, $2, 'task_overdue', $4::jsonb,
         now() - ((item.ordinal - 1)::int * interval '1 second'),
         CASE WHEN item.ordinal = 1 THEN NULL ELSE now() END
       FROM unnest($3::uuid[]) WITH ORDINALITY AS item(notification_id, ordinal)`,
      [
        owner.rows[0].orgId,
        owner.rows[0].id,
        ids,
        JSON.stringify({ taskId: randomUUID() }),
      ],
    );

    await login(page, 'manager2@northbean.example');
    const notificationTab = page.getByRole('tab', { name: '通知' });
    await expect(notificationTab).toContainText('1');
    await notificationTab.click();
    const inbox = page.getByTestId('notification-inbox');
    await expect(page.getByTestId('notification-section-unread')).toBeVisible();
    await expect(page.getByTestId('notification-section-read')).toBeVisible();
    await expect(page.getByTestId(`notification-${ids[0]}`)).toBeVisible();
    await expect(page.getByTestId(`notification-${ids[50]}`)).toHaveCount(0);

    const firstPageResponse = await page.request.get(
      `${apiBase}/me/notifications?unread_only=false`,
    );
    expect(firstPageResponse.status()).toBe(200);
    const firstPage = (await firstPageResponse.json()) as {
      notifications: Array<{ id: string }>;
      nextCursor: string | null;
    };
    expect(firstPage.notifications.map((item) => item.id)).toContain(ids[0]);
    expect(firstPage.notifications.map((item) => item.id)).not.toContain(
      ids[50],
    );
    expect(firstPage.nextCursor).toBeTruthy();
    if (!firstPage.nextCursor) throw new Error('通知第一页缺少下一页游标。');
    const nextPageResponse = await page.request.get(
      `${apiBase}/me/notifications?after=${encodeURIComponent(firstPage.nextCursor)}&unread_only=false`,
    );
    expect(nextPageResponse.status()).toBe(200);
    const nextPage = (await nextPageResponse.json()) as {
      notifications: Array<{ id: string }>;
    };
    expect(nextPage.notifications.map((item) => item.id)).toContain(ids[50]);
    cursorRequests = 0;

    const scrollArea = await inbox.evaluate((element) => {
      let node: HTMLElement | null = element as HTMLElement;
      while (node) {
        const overflowY = getComputedStyle(node).overflowY;
        if (
          ['auto', 'scroll'].includes(overflowY) &&
          node.scrollHeight > node.clientHeight + 1
        ) {
          const bounds = node.getBoundingClientRect();
          return {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          };
        }
        node = node.parentElement;
      }
      return null;
    });
    expect(scrollArea).toBeTruthy();
    if (!scrollArea) throw new Error('通知列表没有可滚动区域。');
    await page.mouse.move(
      scrollArea.x + scrollArea.width / 2,
      scrollArea.y + scrollArea.height / 2,
    );
    for (let attempt = 0; attempt < 12 && cursorRequests === 0; attempt += 1)
      await page.mouse.wheel(0, 500);
    await expect
      .poll(() =>
        inbox.evaluate((element) => (element as HTMLElement).scrollTop),
      )
      .toBeGreaterThan(0);
    await expect.poll(() => cursorRequests).toBeGreaterThan(0);
    await expect(page.getByTestId(`notification-${ids[50]}`)).toBeVisible();
  } finally {
    await pool.query(
      'DELETE FROM floorwalk.notifications WHERE id = ANY($1::uuid[])',
      [ids],
    );
    await pool.end();
  }
});

test('管理员通知入口标记逾期通知已读并进入审核队列', async ({ page }) => {
  const pool = testPool();
  const notificationId = randomUUID();
  try {
    const owner = await pool.query<{ id: string; orgId: string }>(
      `SELECT id, org_id AS "orgId" FROM floorwalk.users
       WHERE login_name = 'hq@northbean.example'`,
    );
    expect(owner.rows[0]).toBeTruthy();
    await pool.query(
      `INSERT INTO floorwalk.notifications
         (id, org_id, user_id, type, payload_json)
       VALUES ($1, $2, $3, 'task_overdue', $4::jsonb)`,
      [
        notificationId,
        owner.rows[0].orgId,
        owner.rows[0].id,
        JSON.stringify({ taskId: randomUUID() }),
      ],
    );

    await login(page, 'hq@northbean.example');
    await expect(page.getByTestId('admin-notifications')).toContainText('1');
    await page.getByTestId('admin-notifications').click();
    await expect(
      page.getByRole('heading', { name: '通知', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: /巡检任务逾期/ }).click();
    await expect(page).toHaveURL(/\/admin\/review$/);
    await expect(
      page.getByRole('heading', { name: '审核队列', exact: true }),
    ).toBeVisible();
    const count = await page.request.get(
      `${apiBase}/me/notifications/unread-count`,
    );
    expect((await count.json()).count).toBe(0);
  } finally {
    await pool.query('DELETE FROM floorwalk.notifications WHERE id = $1', [
      notificationId,
    ]);
    await pool.end();
  }
});

test('店长聊天通知已读后进入对应聊天', async ({ page }) => {
  const pool = testPool();
  const notificationId = randomUUID();
  try {
    const target = await pool.query<{
      userId: string;
      orgId: string;
      inspectionId: string;
    }>(
      `SELECT manager.id AS "userId", manager.org_id AS "orgId",
         inspection.id AS "inspectionId"
       FROM floorwalk.users manager
       JOIN floorwalk.sites site ON site.id = manager.site_id
       JOIN floorwalk.inspections inspection ON inspection.site_id = site.id
       WHERE manager.login_name = 'manager2@northbean.example'
         AND site.code = 'NB-001'
       ORDER BY inspection.created_at DESC LIMIT 1`,
    );
    expect(target.rows[0]).toBeTruthy();
    await pool.query(
      `INSERT INTO floorwalk.notifications
         (id, org_id, user_id, type, payload_json)
       VALUES ($1, $2, $3, 'chat_message', $4::jsonb)`,
      [
        notificationId,
        target.rows[0].orgId,
        target.rows[0].userId,
        JSON.stringify({ inspectionId: target.rows[0].inspectionId }),
      ],
    );

    await login(page, 'manager2@northbean.example');
    await page.getByRole('tab', { name: '通知' }).click();
    await page.getByRole('button', { name: /巡检有新消息/ }).click();
    await expect(page).toHaveURL(
      new RegExp(`/chat/${target.rows[0].inspectionId}$`),
    );
    await expect(
      page.getByRole('heading', { name: '巡检聊天', exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByLabel('聊天内容')).toBeVisible();
  } finally {
    await pool.query('DELETE FROM floorwalk.notifications WHERE id = $1', [
      notificationId,
    ]);
    await pool.end();
  }
});

test('店长账号停用后重新启动时回到登录页', async ({ page }) => {
  const admin = await playwrightRequest.newContext();
  let managerId: string | undefined;
  try {
    const adminLogin = await admin.post(`${apiBase}/auth/session`, {
      data: { loginName: 'hq@northbean.example', password },
    });
    expect(adminLogin.status()).toBe(201);
    const usersResponse = await admin.get(`${apiBase}/admin/users`);
    expect(usersResponse.status()).toBe(200);
    const users = (await usersResponse.json()) as Array<{
      id: string;
      loginName: string;
      disabled: boolean;
    }>;
    const manager = users.find(
      (user) => user.loginName === 'manager2@northbean.example',
    );
    expect(manager).toBeTruthy();
    if (!manager) throw new Error('测试店长账号不存在。');
    managerId = manager.id;

    await login(page, 'manager2@northbean.example');
    await expect(page.getByRole('tab', { name: '今日待巡' })).toBeVisible();
    const disabled = await admin.patch(`${apiBase}/admin/users/${manager.id}`, {
      data: { disabled: true },
    });
    expect(disabled.status()).toBe(200);
    await page.reload();
    await expect(page.getByLabel('登录名', { exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: '今日待巡' })).toHaveCount(0);
  } finally {
    if (managerId)
      await admin
        .patch(`${apiBase}/admin/users/${managerId}`, {
          data: { disabled: false },
        })
        .catch(() => undefined);
    await admin.delete(`${apiBase}/auth/session`).catch(() => undefined);
    await admin.dispose();
  }
});
