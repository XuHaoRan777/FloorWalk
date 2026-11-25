import { expect, test } from '@playwright/test';

const loginName = 'manager2@northbean.example';
const password = 'northbean-demo';
const apiBase = `http://127.0.0.1:${3100 + Number(process.env.FW_SLOT) * 10}/api`;

async function readToday(page: import('@playwright/test').Page) {
  const response = await page
    .context()
    .request.get(`${apiBase}/inspector/today`);
  expect(response.status()).toBe(200);
  return response.json() as Promise<{
    site: { name: string };
    tasks: Array<{ id: string; templateName: string }>;
  }>;
}

test('店长登录、重启保持登录、查看我的并退出', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '开始巡检' })).toBeVisible();
  await page.getByLabel('登录名').fill(loginName);
  await page.getByLabel('密码').fill(password);
  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/auth/session') &&
      response.request().method() === 'POST',
  );
  await page.getByTestId('login-button').click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(201);
  const cookieHeader = await loginResponse.headerValue('set-cookie');
  const sessionId = cookieHeader?.match(/(?:^|,\s*)fw_session=([^;]*)/)?.[1];
  const sessionCookieIsHttpOnly = Boolean(
    sessionId && /(?:^|;\s*)HttpOnly(?:;|$)/i.test(cookieHeader ?? ''),
  );
  expect(sessionCookieIsHttpOnly).toBe(true);
  if (!sessionId) throw new Error('Login response did not set fw_session');

  await expect(
    page.getByRole('tab', { name: '今日待巡', exact: true }),
  ).toBeVisible();
  const storageContainsSessionId = await page.evaluate((id) => {
    const storages = [localStorage, sessionStorage];
    return storages.some((storage) =>
      Array.from({ length: storage.length }, (_, index) =>
        storage.getItem(storage.key(index) ?? ''),
      ).some((value) => value?.includes(id)),
    );
  }, sessionId);
  expect(storageContainsSessionId).toBe(false);
  const documentContainsSessionCookie = await page.evaluate(() =>
    document.cookie.includes('fw_session'),
  );
  expect(documentContainsSessionCookie).toBe(false);

  const today = await readToday(page);
  await expect(
    page.getByRole('heading', { name: today.site.name }),
  ).toBeVisible();
  if (today.tasks.length === 0) {
    await expect(page.getByText('今天没有巡检任务。')).toBeVisible();
  } else {
    await expect(
      page.getByTestId(`today-task-${today.tasks[0].id}`),
    ).toContainText(today.tasks[0].templateName);
  }
  await expect(page.getByTestId('start-inspection')).toHaveCount(0);
  await expect(page.getByTestId('submit-inspection')).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByRole('heading', { name: today.site.name }),
  ).toBeVisible();
  await page.getByLabel('我的').click();
  await expect(page.getByText(loginName, { exact: true })).toBeVisible();
  await expect(
    page.getByLabel('当前门店').filter({ hasText: today.site.name }),
  ).toBeVisible();
  const logoutResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/auth/session') &&
      response.request().method() === 'DELETE',
  );
  await page.getByRole('button', { name: '退出登录' }).click();
  const logoutResponse = await logoutResponsePromise;
  expect(logoutResponse.status()).toBe(204);
  await expect(page.getByRole('heading', { name: '开始巡检' })).toBeVisible();
  const meResponse = await page.context().request.get(`${apiBase}/me`);
  expect(meResponse.status()).toBe(401);
});

test('错误密码显示中文错误提示', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('登录名').fill(loginName);
  await page.getByLabel('密码').fill('wrong-password');
  await page.getByTestId('login-button').click();
  await expect(page.getByText('登录名或密码错误。')).toBeVisible();
});

test('连不上 API 时显示网络错误，并在控制台打印原始错误', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (message) => {
    logs.push(message.text());
  });
  await page.route('**/api/auth/session', (route) => route.abort());
  await page.goto('/');
  await page.getByLabel('登录名').fill(loginName);
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await expect(
    page.getByText('网络连接失败，请检查网络后重试。'),
  ).toBeVisible();
  expect(logs.some((line) => line.includes('[FloorWalk API] fetch 异常'))).toBe(
    true,
  );
});

test('今日任务页不崩溃且隐藏旧建单和提交入口', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('登录名').fill(loginName);
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await expect(page.getByRole('tab', { name: '今日待巡' })).toBeVisible();
  await expect(
    page
      .getByTestId('today-task-list')
      .getByText('今日待巡', { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('start-inspection')).toHaveCount(0);
  await expect(page.getByTestId('submit-inspection')).toHaveCount(0);
});

test('今日任务显示模板、四种状态和商家时区的跨零点时间', async ({ page }) => {
  const siteId = '00000000-0000-4000-8000-000000000101';
  const templateId = '00000000-0000-4000-8000-000000000102';
  const tasks = [
    {
      id: '00000000-0000-4000-8000-000000000201',
      status: 'not_started',
      templateName: '跨午夜任务',
      startsAt: '2026-11-09T14:00:00.000Z',
      dueAt: '2026-11-09T16:30:00.000Z',
    },
    {
      id: '00000000-0000-4000-8000-000000000202',
      status: 'in_progress',
      templateName: '进行中任务',
      startsAt: '2026-11-09T01:00:00.000Z',
      dueAt: '2026-11-09T02:00:00.000Z',
    },
    {
      id: '00000000-0000-4000-8000-000000000203',
      status: 'submitted',
      templateName: '已提交任务',
      startsAt: '2026-11-09T03:00:00.000Z',
      dueAt: '2026-11-09T04:00:00.000Z',
    },
    {
      id: '00000000-0000-4000-8000-000000000204',
      status: 'overdue',
      templateName: '逾期任务',
      startsAt: '2026-11-09T05:00:00.000Z',
      dueAt: '2026-11-09T06:00:00.000Z',
    },
  ].map((task, index) => ({
    ...task,
    siteId,
    templateId,
    taskDate: '2026-11-09',
    position: index,
    createdAt: '2026-11-09T00:00:00.000Z',
  }));
  await page.route('**/api/inspector/today', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        site: {
          id: siteId,
          code: 'TEST',
          name: '示例门店',
          active: true,
          createdAt: '2026-11-01T00:00:00.000Z',
        },
        timezone: 'Asia/Shanghai',
        tasks,
        templates: [],
        submittedToday: false,
        reworkInspections: [],
      }),
    }),
  );

  await page.goto('/');
  await page.getByLabel('登录名').fill(loginName);
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();

  await expect(page.getByRole('heading', { name: '示例门店' })).toBeVisible();
  await expect(page.getByTestId(`today-task-${tasks[0].id}`)).toContainText(
    '跨午夜任务',
  );
  await expect(page.getByTestId(`today-task-${tasks[0].id}`)).toContainText(
    '22:00～次日 00:30',
  );
  await expect(page.getByText('状态：未开始')).toBeVisible();
  await expect(page.getByText('状态：进行中')).toBeVisible();
  await expect(page.getByText('状态：已提交')).toBeVisible();
  await expect(page.getByText('状态：逾期')).toBeVisible();

  const resumeButton = page.getByTestId('today-resume-task');
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await resumeButton.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(bounds?.height).toBe(48);
    expect(bounds?.x).toBeGreaterThanOrEqual(16);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
      width - 16,
    );
  }
});

test('任务详情显示检查项结论、操作时间和巡检聊天', async ({ page }) => {
  const taskId = '00000000-0000-4000-8000-000000000301';
  const siteId = '00000000-0000-4000-8000-000000000101';
  const templateId = '00000000-0000-4000-8000-000000000102';
  const inspectionId = '00000000-0000-4000-8000-000000000302';
  const createdAt = '2026-11-09T00:00:00.000Z';
  const detail = {
    id: taskId,
    siteId,
    templateId,
    taskDate: '2026-11-09',
    position: 0,
    startsAt: '2026-11-09T14:00:00.000Z',
    dueAt: '2026-11-09T16:30:00.000Z',
    status: 'in_progress',
    createdAt,
    templateName: '跨午夜任务',
    timezone: 'Asia/Shanghai',
    inspectionId,
    inspectionStatus: 'rework',
    items: [
      {
        id: '00000000-0000-4000-8000-000000000311',
        position: 1,
        title: '待审项目',
        minPhotoCount: 1,
        acceptanceCriteria: '照片需覆盖标签正面',
        result: 'pending',
        uploadedByName: '张店长',
        uploadedAt: '2026-11-09T12:30:00.000Z',
      },
      {
        id: '00000000-0000-4000-8000-000000000312',
        position: 2,
        title: '通过项目',
        minPhotoCount: 0,
        acceptanceCriteria: '温度处于安全范围',
        result: 'pass',
        uploadedByName: '李店长',
        uploadedAt: '2026-11-09T12:00:00.000Z',
      },
      {
        id: '00000000-0000-4000-8000-000000000313',
        position: 3,
        title: '打回项目',
        minPhotoCount: 1,
        acceptanceCriteria: '检查货架日期',
        result: 'rework',
        uploadedByName: '张店长',
        uploadedAt: '2026-11-09T12:30:00.000Z',
        decisionReason: '不应展示的审核理由',
      },
      {
        id: '00000000-0000-4000-8000-000000000314',
        position: 4,
        title: '不合格项目',
        minPhotoCount: 0,
        acceptanceCriteria: '不得有过期食品',
        result: 'fail',
        uploadedByName: null,
        uploadedAt: null,
      },
    ],
  };

  await page.clock.install({ time: new Date('2026-11-09T12:30:00.000Z') });
  await page.route('**/api/inspector/today', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        site: {
          id: siteId,
          code: 'TEST',
          name: '示例门店',
          active: true,
          createdAt,
        },
        timezone: 'Asia/Shanghai',
        tasks: [
          {
            id: taskId,
            siteId,
            templateId,
            taskDate: '2026-11-09',
            position: 0,
            startsAt: detail.startsAt,
            dueAt: detail.dueAt,
            status: detail.status,
            createdAt,
            templateName: detail.templateName,
          },
        ],
        templates: [],
        submittedToday: false,
        reworkInspections: [],
      }),
    }),
  );
  let detailAttempts = 0;
  await page.route(`**/api/inspector/tasks/${taskId}`, (route) => {
    detailAttempts++;
    return detailAttempts === 1
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'UNAVAILABLE',
            message: '任务详情暂时不可用。',
          }),
        })
      : route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(detail),
        });
  });
  await page.route(`**/api/inspections/${inspectionId}/messages**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ messages: [], hasMoreBefore: false }),
    }),
  );

  await page.goto('/');
  await page.getByLabel('登录名').fill(loginName);
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await expect(page.getByTestId(`today-task-${taskId}`)).toBeVisible();
  await page.getByTestId(`today-task-${taskId}`).click();
  await expect(page).toHaveURL(`/inspection/${taskId}`);
  await expect(page.getByText('任务详情暂时不可用。')).toBeVisible();
  await page.getByRole('button', { name: '重新加载' }).click();
  const taskDetailPage = page.getByTestId('task-detail-screen');
  await expect(
    taskDetailPage.getByRole('heading', { name: '跨午夜任务' }),
  ).toBeVisible();

  await expect(
    taskDetailPage.getByText('22:00～次日 00:30', { exact: true }),
  ).toBeVisible();
  await expect(taskDetailPage.getByTestId('task-item-1')).toContainText(
    '验收要点：照片需覆盖标签正面',
  );
  await expect(taskDetailPage.getByTestId('task-item-1')).toContainText(
    '最少照片：1 张',
  );
  await expect(taskDetailPage.getByTestId('task-item-1')).toContainText(
    '当前结论：待审',
  );
  await expect(taskDetailPage.getByTestId('task-item-1')).toContainText(
    '最后提交：张店长',
  );
  await expect(taskDetailPage.getByTestId('task-item-1')).toContainText(
    '上传于 20:30',
  );
  await expect(taskDetailPage.getByTestId('task-item-1')).toContainText(
    '21:00 起可开始',
  );
  await expect(taskDetailPage.getByTestId('task-item-2')).toContainText(
    '当前结论：通过',
  );
  await expect(taskDetailPage.getByTestId('task-item-3')).toContainText(
    '当前结论：打回',
  );
  await expect(taskDetailPage.getByTestId('task-item-3')).not.toContainText(
    '不应展示的审核理由',
  );
  await expect(taskDetailPage.getByTestId('task-item-4')).toContainText(
    '当前结论：不合格',
  );
  await expect(
    taskDetailPage.getByRole('heading', { name: '巡检聊天' }),
  ).toBeVisible();
  await expect(taskDetailPage.getByLabel('聊天内容')).toBeVisible();
});

test('截止后禁用未上传项，打回宽限到期禁用重传并显示服务端拒绝提示', async ({
  page,
}) => {
  const taskId = '00000000-0000-4000-8000-000000000351';
  const siteId = '00000000-0000-4000-8000-000000000101';
  const templateId = '00000000-0000-4000-8000-000000000102';
  const createdAt = '2026-11-09T00:00:00.000Z';
  const dueAt = '2026-11-09T12:00:00.000Z';
  const detail = {
    id: taskId,
    siteId,
    templateId,
    taskDate: '2026-11-09',
    position: 0,
    startsAt: '2026-11-09T10:00:00.000Z',
    dueAt,
    status: 'overdue',
    createdAt,
    templateName: '逾期巡检',
    timezone: 'Asia/Shanghai',
    inspectionId: null,
    inspectionStatus: 'rework',
    items: [
      {
        id: '00000000-0000-4000-8000-000000000352',
        position: 1,
        title: '尚未上传',
        minPhotoCount: 1,
        acceptanceCriteria: '必须上传现场照片',
        result: 'pending',
        uploadedByName: null,
        uploadedAt: null,
      },
      {
        id: '00000000-0000-4000-8000-000000000353',
        position: 2,
        title: '打回后重传',
        minPhotoCount: 1,
        acceptanceCriteria: '照片覆盖检查区域',
        result: 'rework',
        uploadedByName: '李店长',
        uploadedAt: '2026-11-09T11:00:00.000Z',
      },
    ],
  };
  const photoBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/7ZsAAAAASUVORK5CYII=',
    'base64',
  );

  await page.clock.install({ time: new Date('2026-11-09T12:30:00.000Z') });
  await page.route('**/api/inspector/today', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        site: {
          id: siteId,
          code: 'TEST',
          name: '示例门店',
          active: true,
          createdAt,
        },
        timezone: 'Asia/Shanghai',
        tasks: [
          {
            id: taskId,
            siteId,
            templateId,
            taskDate: '2026-11-09',
            position: 0,
            startsAt: detail.startsAt,
            dueAt,
            status: 'overdue',
            createdAt,
            templateName: detail.templateName,
          },
        ],
        templates: [],
        submittedToday: false,
        reworkInspections: [],
      }),
    }),
  );
  await page.route(`**/api/inspector/tasks/${taskId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(detail),
    }),
  );
  await page.route(`**/api/tasks/${taskId}/items/2/uploads`, (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'INVALID_STATE',
        message: '任务已经关闭。',
      }),
    }),
  );

  await page.goto('/');
  await page.getByLabel('登录名').fill(loginName);
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await page.getByTestId(`today-task-${taskId}`).click();

  const unuploadedItem = page.getByTestId('task-item-1');
  await expect(unuploadedItem).toContainText('已过截止时间，未上传项不可操作');
  await expect(unuploadedItem.getByTestId('submit-item-1')).toBeDisabled();
  await expect(
    unuploadedItem.getByRole('button', { name: '打开相机拍摄第1项照片' }),
  ).toBeDisabled();

  const reworkItem = page.getByTestId('task-item-2');
  const reworkSubmit = reworkItem.getByTestId('submit-item-2');
  await expect(reworkItem).toContainText('重传截止 21:00');
  await expect(reworkItem.getByTestId('capture-item-2')).toBeEnabled();
  await reworkItem.getByRole('button', { name: '自评合格第2项' }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await reworkItem.getByTestId('capture-item-2').click();
  await (
    await chooserPromise
  ).setFiles({
    name: 'rework.png',
    mimeType: 'image/png',
    buffer: photoBytes,
  });
  await expect(reworkSubmit).toBeEnabled();
  const uploadResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/tasks/${taskId}/items/2/uploads`) &&
      response.request().method() === 'POST',
  );
  await reworkSubmit.click();
  expect((await uploadResponse).status()).toBe(409);
  await expect(
    reworkItem.getByText('当前巡检状态不允许此操作。'),
  ).toBeVisible();

  await page.clock.fastForward(31 * 60_000);
  await expect(reworkItem).toContainText('重传时间已截止');
  await expect(reworkSubmit).toBeDisabled();
  await expect(reworkItem.getByTestId('capture-item-2')).toBeDisabled();
});

test('逐项拍照上传、零照片备注门槛及提交后刷新', async ({ page }) => {
  const taskId = '00000000-0000-4000-8000-000000000401';
  const siteId = '00000000-0000-4000-8000-000000000101';
  const templateId = '00000000-0000-4000-8000-000000000102';
  const inspectionId = '00000000-0000-4000-8000-000000000402';
  const createdAt = '2026-11-09T00:00:00.000Z';
  const items = [
    {
      id: '00000000-0000-4000-8000-000000000411',
      position: 1,
      title: '冷柜温度',
      minPhotoCount: 2,
      acceptanceCriteria: '拍摄温度显示屏',
      result: 'pending',
      uploadedByName: null,
      uploadedAt: null,
    },
    {
      id: '00000000-0000-4000-8000-000000000412',
      position: 2,
      title: '地面清洁',
      minPhotoCount: 0,
      acceptanceCriteria: '确认地面无积水',
      result: 'pending',
      uploadedByName: null,
      uploadedAt: null,
    },
  ];
  const uploads = new Set<number>();
  const uploadedAt = '2026-11-09T14:45:00.000Z';
  const photoBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/7ZsAAAAASUVORK5CYII=',
    'base64',
  );

  await page.clock.install({ time: new Date('2026-11-09T14:30:00.000Z') });
  await page.route('**/api/inspector/today', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        site: {
          id: siteId,
          code: 'TEST',
          name: '示例门店',
          active: true,
          createdAt,
        },
        timezone: 'Asia/Shanghai',
        tasks: [
          {
            id: taskId,
            siteId,
            templateId,
            taskDate: '2026-11-09',
            position: 0,
            startsAt: '2026-11-09T14:00:00.000Z',
            dueAt: '2026-11-09T16:30:00.000Z',
            status: uploads.size === items.length ? 'submitted' : 'in_progress',
            createdAt,
            templateName: '现场巡检',
          },
        ],
        templates: [],
        submittedToday: false,
        reworkInspections: [],
      }),
    }),
  );
  await page.route(`**/api/inspector/tasks/${taskId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: taskId,
        siteId,
        templateId,
        taskDate: '2026-11-09',
        position: 0,
        startsAt: '2026-11-09T14:00:00.000Z',
        dueAt: '2026-11-09T16:30:00.000Z',
        status: uploads.size === items.length ? 'submitted' : 'in_progress',
        createdAt,
        templateName: '现场巡检',
        timezone: 'Asia/Shanghai',
        inspectionId: uploads.size > 0 ? inspectionId : null,
        inspectionStatus: uploads.size > 0 ? 'draft' : null,
        items: items.map((item) => ({
          ...item,
          ...(uploads.has(item.position)
            ? { uploadedByName: '李店长', uploadedAt }
            : {}),
        })),
      }),
    }),
  );
  for (const position of [1, 2]) {
    await page.route(
      `**/api/tasks/${taskId}/items/${position}/uploads`,
      async (route) => {
        uploads.add(position);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: '{}',
        });
      },
    );
  }
  await page.route(`**/api/inspections/${inspectionId}/messages**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ messages: [], hasMoreBefore: false }),
    }),
  );

  await page.goto('/');
  await page.getByLabel('登录名').fill(loginName);
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await page.getByTestId(`today-task-${taskId}`).click();

  const photoItem = page.getByTestId('task-item-1');
  const photoSubmit = photoItem.getByTestId('submit-item-1');
  await expect(photoSubmit).toBeDisabled();
  await expect(photoItem).toContainText('还差 2 张照片');
  await expect(photoItem.getByRole('button', { name: /相册/ })).toHaveCount(0);
  await photoItem.getByRole('button', { name: '自评合格第1项' }).click();
  for (let count = 1; count <= 2; count++) {
    const chooserPromise = page.waitForEvent('filechooser');
    await photoItem
      .getByRole('button', { name: '打开相机拍摄第1项照片' })
      .click();
    const chooser = await chooserPromise;
    expect(await (await chooser.element()).getAttribute('capture')).toBe(
      'environment',
    );
    await chooser.setFiles({
      name: `temperature-${count}.png`,
      mimeType: 'image/png',
      buffer: photoBytes,
    });
    if (count === 1) {
      await expect(photoItem).toContainText('还差 1 张照片');
      await expect(photoSubmit).toBeDisabled();
    }
  }
  await expect(photoSubmit).toBeEnabled();
  const photoUploadPromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/tasks/${taskId}/items/1/uploads`) &&
      response.request().method() === 'POST',
  );
  await photoSubmit.click();
  expect((await photoUploadPromise).status()).toBe(201);
  await expect(photoItem).toContainText('最后提交：李店长');
  await expect(photoItem).toContainText('上传于 22:45');

  const noteItem = page.getByTestId('task-item-2');
  const noteSubmit = noteItem.getByTestId('submit-item-2');
  await expect(noteItem.getByTestId('capture-item-2')).toHaveCount(0);
  await expect(noteItem.getByTestId('assess-pass-2')).toHaveCount(0);
  await expect(noteSubmit).toBeDisabled();
  await noteItem.getByLabel('第2项备注').fill('地面干燥');
  await expect(noteSubmit).toBeEnabled();
  const noteUploadPromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/tasks/${taskId}/items/2/uploads`) &&
      response.request().method() === 'POST',
  );
  await noteSubmit.click();
  expect((await noteUploadPromise).status()).toBe(201);
  await expect(noteItem).toContainText('最后提交：李店长');
  await page.getByRole('button', { name: '返回上级页面' }).click();
  await expect(page.getByTestId(`today-task-${taskId}`)).toContainText(
    '状态：已提交',
  );
});

test('首次启动时删除旧的本地 token 并显示登录页', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('floorwalk.auth.token', 'invalid-token'),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '开始巡检' })).toBeVisible();
  const legacyTokenWasRemoved = await page.evaluate(
    () => localStorage.getItem('floorwalk.auth.token') === null,
  );
  expect(legacyTokenWasRemoved).toBe(true);
});

test('FW-008 AC-03 未登录直接访问受保护和未知地址回登录，且没有底部栏', async ({
  page,
}) => {
  for (const url of [
    '/today',
    '/profile',
    '/inspection/00000000-0000-0000-0000-000000000000',
    '/unknown/path',
  ]) {
    await page.goto(url);
    await expect(page.getByRole('heading', { name: '开始巡检' })).toBeVisible();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('tab')).toHaveCount(0);
  }
});

test('FW-008 AC-03 Tabs 切换会更新 URL，今日页不暴露旧巡检入口', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('登录名').fill(loginName);
  await page.getByLabel('密码').fill(password);
  await page.getByTestId('login-button').click();
  await expect(page).toHaveURL('/today');
  await expect(page.getByRole('tab')).toHaveCount(4);
  await expect(page.getByRole('tab', { name: '记录' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '通知' })).toBeVisible();
  await page.getByLabel('我的').click();
  await expect(page).toHaveURL('/profile');
  await page.getByLabel('今日待巡', { exact: true }).click();
  await expect(page).toHaveURL('/today');
  await expect(page.getByRole('tab')).toHaveCount(4);
  await expect(page.getByTestId('start-inspection')).toHaveCount(0);
  await expect(page.getByTestId('submit-inspection')).toHaveCount(0);
});
