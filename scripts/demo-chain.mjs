import { spawn, spawnSync } from 'node:child_process';
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

async function login(role) {
  const response = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `${role}@northbean.example`,
      password: 'northbean-demo',
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
  await login('inspector');
  const today = await call('/api/inspector/today', {
    headers: authHeaders('inspector'),
  });
  const inspection = await call(
    '/api/inspections',
    jsonOptions('inspector', { templateId: today.template.id }),
    201,
  );
  const detailPath = `/api/inspections/${inspection.id}`;
  let detail = await call(detailPath, { headers: authHeaders('inspector') });
  let coldItemId;
  for (const item of detail.items) {
    const isCold = item.title.includes('冷柜');
    if (isCold) coldItemId = item.id;
    await call(`${detailPath}/items/${item.id}`, {
      method: 'PATCH',
      headers: {
        ...authHeaders('inspector'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ result: isCold ? 'fail' : 'pass' }),
    });
    const form = new FormData();
    form.append(
      'file',
      new Blob(['demo-photo'], { type: 'image/jpeg' }),
      `${item.id}.jpg`,
    );
    await call(
      `${detailPath}/items/${item.id}/evidence`,
      {
        method: 'POST',
        headers: authHeaders('inspector'),
        body: form,
      },
      201,
    );
  }
  const firstSubmit = await call(
    `${detailPath}/submit`,
    { headers: authHeaders('inspector'), method: 'POST' },
    201,
  );
  if (firstSubmit.score !== 88)
    throw new Error(`演示链第一阶段应得 88，实际 ${firstSubmit.score}。`);

  await login('supervisor');
  await call(
    `${detailPath}/review`,
    jsonOptions('supervisor', { action: 'start' }),
    201,
  );
  await call(
    `${detailPath}/review`,
    jsonOptions('supervisor', {
      action: 'rework',
      reworkItemIds: [coldItemId],
    }),
    201,
  );

  await login('inspector+nb-002');
  const nb002Records = await call('/api/inspector/inspections?limit=10', {
    headers: authHeaders('inspector+nb-002'),
  });
  const nb002Rework = nb002Records.items.find(
    (item) => item.status === 'rework',
  );
  if (!nb002Rework) throw new Error('NB-002 第一页没有打回巡检单。');
  const nb002Path = `/api/inspections/${nb002Rework.id}`;
  const nb002Detail = await call(nb002Path, {
    headers: authHeaders('inspector+nb-002'),
  });
  for (const item of nb002Detail.items.filter(
    (item) => item.result === 'fail',
  )) {
    await call(`${nb002Path}/items/${item.id}`, {
      method: 'PATCH',
      headers: {
        ...authHeaders('inspector+nb-002'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ result: 'pass' }),
    });
    const photo = new FormData();
    photo.append(
      'file',
      new Blob(['recheck'], { type: 'image/jpeg' }),
      'recheck.jpg',
    );
    await call(
      `${nb002Path}/items/${item.id}/evidence`,
      {
        method: 'POST',
        headers: authHeaders('inspector+nb-002'),
        body: photo,
      },
      201,
    );
  }
  await call(
    `${nb002Path}/submit`,
    {
      headers: authHeaders('inspector+nb-002'),
      method: 'POST',
    },
    201,
  );
  await call(
    `${nb002Path}/review`,
    jsonOptions('supervisor', { action: 'start' }),
    201,
  );
  await call(
    `${nb002Path}/review`,
    jsonOptions('supervisor', {
      action: 'rework',
      reworkItemIds: [
        nb002Detail.items.find((item) => item.result === 'fail').id,
      ],
    }),
    201,
  );
  const nb002ChatPath = `/api/inspections/${nb002Rework.id}/messages`;
  const seedConversation = await call(nb002ChatPath, {
    headers: authHeaders('supervisor'),
  });
  if (seedConversation.messages.length !== 2)
    throw new Error('NB-002 打回单的种子聊天应有两条消息。');
  const afterSeedSeq = seedConversation.messages.at(-1).seq;
  const supervisorMessage = new FormData();
  supervisorMessage.append('text', '请补充冷柜温度照片后重新提交。');
  const sentBySupervisor = await call(
    nb002ChatPath,
    {
      method: 'POST',
      headers: authHeaders('supervisor'),
      body: supervisorMessage,
    },
    201,
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
  inspectorReply.append('file', photo, 'nb-002-reply.jpg');
  const sentByInspector = await call(
    nb002ChatPath,
    {
      method: 'POST',
      headers: authHeaders('inspector+nb-002'),
      body: inspectorReply,
    },
    201,
  );
  for (const role of ['supervisor', 'inspector+nb-002']) {
    const messages = await call(`${nb002ChatPath}?after=${afterSeedSeq}`, {
      headers: authHeaders(role),
    });
    if (
      messages.messages.length !== 2 ||
      messages.messages[0].id !== sentBySupervisor.id ||
      messages.messages[1].id !== sentByInspector.id
    )
      throw new Error(`${role} 没有读取到本轮新发的两条消息。`);
  }
  const firstRecordsPage = await call('/api/inspector/inspections?limit=10', {
    headers: authHeaders('inspector+nb-002'),
  });
  if (!firstRecordsPage.items.some((item) => item.id === nb002Rework.id))
    throw new Error('店员记录页第一页缺少 NB-002 打回单。');
  console.log('AC-07 聊天往返与店员记录页步骤通过。');

  await call(`${detailPath}/items/${coldItemId}`, {
    method: 'PATCH',
    headers: {
      ...authHeaders('inspector'),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ result: 'pass' }),
  });
  const coldPhoto = new FormData();
  coldPhoto.append(
    'file',
    new Blob(['replacement-photo'], { type: 'image/jpeg' }),
    `${coldItemId}-replacement.jpg`,
  );
  await call(
    `${detailPath}/items/${coldItemId}/evidence`,
    {
      method: 'POST',
      headers: authHeaders('inspector'),
      body: coldPhoto,
    },
    201,
  );
  detail = await call(detailPath, { headers: authHeaders('inspector') });
  const secondSubmit = await call(
    `${detailPath}/submit`,
    { headers: authHeaders('inspector'), method: 'POST' },
    201,
  );
  if (secondSubmit.score !== 100)
    throw new Error(
      `演示链第二阶段应重新提交 100，当前 API 返回 ${secondSubmit.score}；第一处失败属于业务规则，等待 FW-004。`,
    );
  await call(
    `${detailPath}/review`,
    jsonOptions('supervisor', { action: 'start' }),
    201,
  );
  await call(
    `${detailPath}/review`,
    jsonOptions('supervisor', { action: 'approve' }),
    201,
  );
  const dashboard = await call('/api/dashboard/sites', {
    headers: authHeaders('supervisor'),
  });
  const nb001 = dashboard.find((row) => row.site.code === 'NB-001');
  if (nb001?.latestScore !== 100)
    throw new Error(`看板应显示 NB-001 为 100，实际 ${nb001?.latestScore}。`);
} finally {
  try {
    await logoutAll();
  } finally {
    stopApi();
  }
}
