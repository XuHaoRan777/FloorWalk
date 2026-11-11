import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const configuredSlot = process.env.FW_SLOT;
if (!configuredSlot) {
  throw new Error('FW_SLOT 未设置；请设置为 1、2 或 3。');
}
const slot = Number(configuredSlot);
if (!Number.isInteger(slot) || slot < 1 || slot > 3)
  throw new Error('FW_SLOT 必须是 1、2 或 3。');
const apiPort = 3100 + slot * 10;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL 未配置。');
const databaseUrl = new URL(process.env.DATABASE_URL);
databaseUrl.pathname = `/floorwalk_e2e_${slot}`;
const env = {
  ...process.env,
  FW_SLOT: String(slot),
  PORT: String(apiPort),
  HOST: '127.0.0.1',
  DATABASE_URL: databaseUrl.toString(),
  STORAGE_DIR: path.resolve('apps', 'api', '.e2e', `slot-${slot}`, 'storage'),
  NODE_ENV: 'development',
};
const require = createRequire(path.resolve('apps/api/package.json'));
const { Pool } = require('pg');
const database = new Pool({ connectionString: databaseUrl.toString() });
const baseUrl = `http://127.0.0.1:${apiPort}`;
const sessionCookies = new Map();

function runPnpm(args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function stopApi() {
  if (!api?.pid) return;
  if (process.platform === 'win32') {
    spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Get-NetTCPConnection -State Listen -LocalPort ${apiPort} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`,
      ],
      { stdio: 'ignore', windowsHide: true },
    );
    spawnSync('taskkill', ['/pid', String(api.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    api.kill('SIGTERM');
  }
}

runPnpm(['--filter', '@apps/api', 'db:migrate']);
runPnpm(['--filter', '@apps/api', 'db:seed']);

const api = spawn(process.execPath, ['scripts/e2e-api.mjs'], {
  cwd: process.cwd(),
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true,
});
api.stdout.on('data', (chunk) => process.stdout.write(`[api] ${chunk}`));
api.stderr.on('data', (chunk) => process.stderr.write(`[api] ${chunk}`));

async function waitForApi() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The dev server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('槽位 API 启动超时。');
}

async function call(pathname, options = {}, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (response.status !== expectedStatus)
    throw new Error(
      `${options.method ?? 'GET'} ${pathname} 预期 ${expectedStatus}，得到 ${response.status}：${JSON.stringify(body)}`,
    );
  return body;
}

function readSessionCookie(response) {
  const setCookies = response.headers.getSetCookie?.() ?? [
    response.headers.get('set-cookie') ?? '',
  ];
  const cookie = setCookies
    .find((header) => header.startsWith('fw_session='))
    ?.split(';', 1)[0];
  if (!cookie || cookie === 'fw_session=')
    throw new Error('登录响应未设置会话 cookie。');
  return cookie;
}

async function login(role, orgId) {
  const response = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      loginName:
        role === 'admin' ? 'hq@northbean.example' : `${role}@northbean.example`,
      password: 'northbean-demo',
      ...(orgId ? { orgId } : {}),
    }),
  });
  if (response.status !== 201)
    throw new Error(`登录 ${role} 预期 201，得到 ${response.status}。`);
  const result = await response.json();
  sessionCookies.set(role, readSessionCookie(response));
  return result;
}

const authHeaders = (role) => {
  const cookie = sessionCookies.get(role);
  if (!cookie) throw new Error(`缺少 ${role} 会话 cookie。`);
  return { cookie };
};
const jsonOptions = (role, body) => ({
  method: 'POST',
  headers: { ...authHeaders(role), 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

async function logoutAll() {
  let failed = false;
  for (const [role, cookie] of sessionCookies) {
    try {
      const response = await fetch(`${baseUrl}/api/auth/session`, {
        method: 'DELETE',
        headers: { cookie },
      });
      if (response.status !== 204) failed = true;
    } catch {
      failed = true;
    }
  }
  sessionCookies.clear();
  if (failed) throw new Error('无法清理演示链会话。');
}

try {
  await waitForApi();
  const adminLogin = await login('admin');
  await login('inspector', adminLogin.user.org.id);
  const today = await call('/api/inspector/today', {
    headers: authHeaders('inspector'),
  });
  const adminSites = await call('/api/admin/sites', {
    headers: authHeaders('admin'),
  });
  const site = adminSites.find((entry) => entry.code === 'NB-001');
  const template = today.templates.find((entry) => entry.name === '开店检查');
  if (!site || !template) throw new Error('NB-001 演示门店或模板不存在。');

  const taskDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const weekday = new Date(`${taskDate}T12:00:00+08:00`).getUTCDay() || 7;
  const schedule = await call(
    '/api/admin/schedules',
    jsonOptions('admin', {
      name: 'FW-028 演示日程',
      days: Array.from({ length: 7 }, (_, index) => ({
        weekday: index + 1,
        enabled: index + 1 === weekday,
        tasks:
          index + 1 === weekday
            ? [{ templateId: template.id, startsAt: '00:00', endsAt: '23:59' }]
            : [],
      })),
    }),
    201,
  );
  await call(
    '/api/admin/site-schedules',
    {
      method: 'PUT',
      headers: { ...authHeaders('admin'), 'content-type': 'application/json' },
      body: JSON.stringify({ siteIds: [site.id], scheduleId: schedule.id }),
    },
    200,
  );
  const taskResult = await database.query(
    `SELECT id FROM floorwalk.inspection_tasks
     WHERE site_id = $1 AND template_id = $2 AND task_date = $3::date
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    [site.id, template.id, taskDate],
  );
  const taskId = taskResult.rows[0]?.id;
  if (!taskId) throw new Error('日程没有生成 NB-001 当天任务。');
  await database.query(
    'UPDATE floorwalk.inspection_tasks SET due_at = $2 WHERE id = $1',
    [taskId, new Date(Date.now() + 60 * 60 * 1000)],
  );

  async function uploadItem(item) {
    const form = new FormData();
    form.append('selfAssessment', item.position === 3 ? 'fail' : 'pass');
    if (item.minPhotoCount === 0) form.append('note', '现场检查完成。');
    for (let photoIndex = 0; photoIndex < item.minPhotoCount; photoIndex += 1)
      form.append(
        'files',
        new Blob([`demo-photo-${item.position}-${photoIndex}`], {
          type: 'image/jpeg',
        }),
        `${item.position}-${photoIndex}.jpg`,
      );
    await call(
      `/api/tasks/${taskId}/items/${item.position}/uploads`,
      { method: 'POST', headers: authHeaders('inspector'), body: form },
      201,
    );
  }

  for (const item of template.items) await uploadItem(item);
  let taskReview = await call(`/api/tasks/${taskId}/review`, {
    headers: authHeaders('admin'),
  });
  const coldItem = taskReview.items.find((item) => item.title.includes('冷柜'));
  if (!coldItem) throw new Error('当天任务缺少冷柜温度检查项。');

  await call(
    `/api/tasks/${taskId}/items/${coldItem.id}/decision`,
    jsonOptions('admin', { result: 'rework' }),
    201,
  );
  await uploadItem({
    ...coldItem,
    minPhotoCount: Math.max(coldItem.minPhotoCount, 1),
  });
  taskReview = await call(`/api/tasks/${taskId}/review`, {
    headers: authHeaders('admin'),
  });
  for (const item of taskReview.items.filter(
    (entry) => entry.id !== coldItem.id,
  ))
    await call(
      `/api/tasks/${taskId}/items/${item.id}/decision`,
      jsonOptions('admin', { result: 'pass' }),
      201,
    );
  await database.query(
    'UPDATE floorwalk.inspection_tasks SET due_at = $2 WHERE id = $1',
    [taskId, new Date(Date.now() - 1000)],
  );
  const firstDecision = await call(
    `/api/tasks/${taskId}/items/${coldItem.id}/decision`,
    jsonOptions('admin', { result: 'fail' }),
    201,
  );
  if (firstDecision.score !== 88 || firstDecision.inspectionStatus !== 'passed')
    throw new Error(
      `演示链首次判定应为 88 分且整单通过，实际 ${firstDecision.score} 分、${firstDecision.inspectionStatus}。`,
    );
  const rejudged = await call(
    `/api/tasks/${taskId}/items/${coldItem.id}/decision`,
    jsonOptions('admin', { result: 'pass' }),
    201,
  );
  if (rejudged.score !== 100)
    throw new Error(`改判后应为 100 分，实际 ${rejudged.score}。`);
  const inspectionId = rejudged.inspectionId;
  if (!inspectionId) throw new Error('当天任务未关联巡检记录。');
  const detailPath = `/api/inspections/${inspectionId}`;
  await call(detailPath, { headers: authHeaders('inspector') });

  await login('inspector+nb-002');
  const nb002ChatInspection = await database.query(
    `SELECT inspection.id FROM floorwalk.inspections inspection
     JOIN floorwalk.sites site ON site.id = inspection.site_id
     JOIN floorwalk.chat_messages message ON message.inspection_id = inspection.id
     WHERE site.code = 'NB-002'
     ORDER BY inspection.created_at DESC, inspection.id DESC LIMIT 1`,
  );
  const nb002InspectionId = nb002ChatInspection.rows[0]?.id;
  if (!nb002InspectionId) throw new Error('NB-002 没有带聊天种子的历史巡检。');
  const nb002ChatPath = `/api/inspections/${nb002InspectionId}/messages`;
  const seedConversation = await call(nb002ChatPath, {
    headers: authHeaders('admin'),
  });
  if (seedConversation.messages.length !== 2)
    throw new Error('NB-002 打回单的种子聊天应有两条消息。');
  const afterSeedSeq = seedConversation.messages.at(-1).seq;
  const adminMessage = new FormData();
  adminMessage.append('text', '请补充冷柜温度照片后重新上传。');
  await call(
    nb002ChatPath,
    {
      method: 'POST',
      headers: authHeaders('admin'),
      body: adminMessage,
    },
    403,
  );
  const seedImage = seedConversation.messages.find(
    (message) => message.imageUrl,
  );
  if (!seedImage) throw new Error('NB-002 种子聊天缺少图片。');
  const signedImageUrl = new URL(seedImage.imageUrl);
  const photoResponse = await fetch(
    `${baseUrl}${signedImageUrl.pathname}${signedImageUrl.search}`,
  );
  if (!photoResponse.ok) throw new Error('无法读取 NB-002 种子聊天图片。');
  const photo = new Blob([await photoResponse.arrayBuffer()], {
    type: 'image/jpeg',
  });
  const inspectorReply = new FormData();
  inspectorReply.append('text', '冷柜照片已补充。');
  const sentByInspector = await call(
    nb002ChatPath,
    {
      method: 'POST',
      headers: authHeaders('inspector+nb-002'),
      body: inspectorReply,
    },
    201,
  );
  const inspectorImageReply = new FormData();
  inspectorImageReply.append('file', photo, 'nb-002-reply.jpg');
  const sentImageByInspector = await call(
    nb002ChatPath,
    {
      method: 'POST',
      headers: authHeaders('inspector+nb-002'),
      body: inspectorImageReply,
    },
    201,
  );
  for (const role of ['admin', 'inspector+nb-002']) {
    const messages = await call(`${nb002ChatPath}?after=${afterSeedSeq}`, {
      headers: authHeaders(role),
    });
    if (
      messages.messages.length !== 2 ||
      messages.messages[0].id !== sentByInspector.id ||
      messages.messages[1].id !== sentImageByInspector.id
    )
      throw new Error(`${role} 没有读取到本轮新发的两条消息。`);
  }
  const firstRecordsPage = await call('/api/inspector/inspections?limit=10', {
    headers: authHeaders('inspector+nb-002'),
  });
  if (!firstRecordsPage.items.some((item) => item.id === nb002InspectionId))
    throw new Error('店员记录页第一页缺少 NB-002 聊天种子巡检。');
  console.log('AC-07 聊天往返与店员记录页步骤通过。');

  const dashboard = await call('/api/dashboard/sites', {
    headers: authHeaders('admin'),
  });
  const nb001 = dashboard.find((row) => row.site.code === 'NB-001');
  if (nb001?.latestScore !== 100)
    throw new Error(`看板应显示 NB-001 为 100，实际 ${nb001?.latestScore}。`);
} finally {
  try {
    await logoutAll();
  } finally {
    try {
      stopApi();
    } finally {
      await database.end();
    }
  }
}
