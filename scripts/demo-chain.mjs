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
};
const baseUrl = `http://127.0.0.1:${apiPort}`;

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
    spawnSync('taskkill', ['/pid', String(api.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    api.kill('SIGTERM');
  }
}

runPnpm(['--filter', '@libs/shared', 'build']);
runPnpm(['--filter', '@apps/api', 'db:migrate']);
runPnpm(['--filter', '@apps/api', 'db:seed']);

const api = spawn(command, ['--filter', '@apps/api', 'dev'], {
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

const authHeaders = (token) => ({ authorization: `Bearer ${token}` });
const jsonOptions = (token, body) => ({
  method: 'POST',
  headers: { ...authHeaders(token), 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

try {
  await waitForApi();
  const login = await call(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'inspector@northbean.example',
        password: 'northbean-demo',
      }),
    },
    201,
  );
  const inspectorToken = login.token;
  const today = await call('/api/inspector/today', {
    headers: authHeaders(inspectorToken),
  });
  const inspection = await call(
    '/api/inspections',
    jsonOptions(inspectorToken, { templateId: today.template.id }),
    201,
  );
  const detailPath = `/api/inspections/${inspection.id}`;
  let detail = await call(detailPath, { headers: authHeaders(inspectorToken) });
  let coldItemId;
  for (const item of detail.items) {
    const isCold = item.title.includes('冷柜');
    if (isCold) coldItemId = item.id;
    await call(`${detailPath}/items/${item.id}`, {
      method: 'PATCH',
      headers: {
        ...authHeaders(inspectorToken),
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
        headers: authHeaders(inspectorToken),
        body: form,
      },
      201,
    );
  }
  const firstSubmit = await call(
    `${detailPath}/submit`,
    { headers: authHeaders(inspectorToken), method: 'POST' },
    201,
  );
  if (firstSubmit.score !== 88)
    throw new Error(`演示链第一阶段应得 88，实际 ${firstSubmit.score}。`);

  const supervisorLogin = await call(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'supervisor@northbean.example',
        password: 'northbean-demo',
      }),
    },
    201,
  );
  const supervisorToken = supervisorLogin.token;
  await call(
    `${detailPath}/review`,
    jsonOptions(supervisorToken, { action: 'start' }),
    201,
  );
  await call(
    `${detailPath}/review`,
    jsonOptions(supervisorToken, {
      action: 'rework',
      reworkItemIds: [coldItemId],
    }),
    201,
  );

  await call(`${detailPath}/items/${coldItemId}`, {
    method: 'PATCH',
    headers: {
      ...authHeaders(inspectorToken),
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
      headers: authHeaders(inspectorToken),
      body: coldPhoto,
    },
    201,
  );
  detail = await call(detailPath, { headers: authHeaders(inspectorToken) });
  const secondSubmit = await call(
    `${detailPath}/submit`,
    { headers: authHeaders(inspectorToken), method: 'POST' },
    201,
  );
  if (secondSubmit.score !== 100)
    throw new Error(
      `演示链第二阶段应重新提交 100，当前 API 返回 ${secondSubmit.score}；第一处失败属于业务规则，等待 FW-004。`,
    );
  await call(
    `${detailPath}/review`,
    jsonOptions(supervisorToken, { action: 'start' }),
    201,
  );
  await call(
    `${detailPath}/review`,
    jsonOptions(supervisorToken, { action: 'approve' }),
    201,
  );
  const dashboard = await call('/api/dashboard/sites', {
    headers: authHeaders(supervisorToken),
  });
  const nb001 = dashboard.find((row) => row.site.code === 'NB-001');
  if (nb001?.latestScore !== 100)
    throw new Error(`看板应显示 NB-001 为 100，实际 ${nb001?.latestScore}。`);
} finally {
  stopApi();
}
