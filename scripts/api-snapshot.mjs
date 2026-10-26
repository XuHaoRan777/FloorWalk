import { spawn, spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { register } from 'tsx/esm/api';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';

register();
const { createPool } = await import('../apps/api/src/db/client.ts');
const { runMigrations } = await import('../apps/api/src/db/migrate.ts');
const { seedDatabase } = await import('../apps/api/src/db/seed.ts');
const slot = Number(process.env.FW_SLOT);
if (!Number.isInteger(slot) || slot < 1 || slot > 3)
  throw new Error('FW_SLOT 必须设置为 1、2 或 3。');
const apiPort = 3100 + slot * 10;
const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
if (decodeURIComponent(databaseUrl.username) !== 'floorwalk')
  throw new Error('只允许使用 floorwalk 数据库角色。');
databaseUrl.pathname = `/floorwalk_e2e_${slot}`;
const storageDir = path.resolve(`apps/api/.e2e/slot-${slot}/storage`);
async function resetSlotResources() {
  const pool = createPool(databaseUrl.toString());
  try {
    await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
    await pool.query('DROP SCHEMA IF EXISTS floorwalk CASCADE');
  } finally {
    await pool.end();
  }
  await rm(storageDir, { recursive: true, force: true });
  await mkdir(storageDir, { recursive: true });
  await runMigrations(databaseUrl.toString());
  await seedDatabase(databaseUrl.toString(), storageDir);
}
const output = process.argv[2];
if (!output) throw new Error('用法：api-snapshot.mjs <输出路径>');
const env = {
  ...process.env,
  FW_SLOT: String(slot),
  PORT: String(apiPort),
  HOST: '127.0.0.1',
  DATABASE_URL: databaseUrl.toString(),
  STORAGE_DIR: storageDir,
};
const baseUrl = `http://127.0.0.1:${apiPort}`;
env.API_PUBLIC_BASE_URL = baseUrl;
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
for (const target of ['@libs/shared', '@apps/api']) {
  const result = spawnSync(pnpm, ['--filter', target, 'build'], {
    env,
    shell: true,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`${target} 构建失败。`);
}
const { apiRoutes, userRoles } = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
)('@libs/shared');

// Refuse to reuse or stop somebody else's API before touching slot resources.
await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', () => reject(new Error(`槽位端口 ${apiPort} 已占用。`)));
  probe.listen(apiPort, '127.0.0.1', () => probe.close(resolve));
});
await resetSlotResources();
const api = spawn(process.execPath, ['apps/api/dist/main.js'], {
  env,
  stdio: 'ignore',
  windowsHide: true,
});
let startupError;
api.on('error', (error) => {
  startupError = error;
});

function stopApi() {
  if (process.platform === 'win32') {
    // Resolve the listener too: shell wrappers do not reliably stop child node.
    spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Get-NetTCPConnection -State Listen -LocalPort ${apiPort} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`,
      ],
      { stdio: 'ignore', windowsHide: true },
    );
    if (api.pid)
      spawnSync('taskkill', ['/pid', String(api.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      });
  } else {
    api.kill('SIGTERM');
  }
}

const records = [];
const tokens = {};
const json = (body) => ({ 'content-type': 'application/json', ...body });
async function call(
  label,
  pathname,
  role,
  method = 'GET',
  body,
  expected = 200,
) {
  const headers = role ? { authorization: `Bearer ${tokens[role]}` } : {};
  const multipart = body instanceof FormData;
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body && !multipart ? json(headers) : headers,
    body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
  });
  const result = await response.json();
  if (response.status !== expected)
    throw new Error(`${label}: 预期 ${expected}，得到 ${response.status}`);
  records.push({ label, status: response.status, body: result });
  return result;
}
const photo = () => {
  const form = new FormData();
  form.append(
    'file',
    new Blob(['snapshot-photo'], { type: 'image/jpeg' }),
    'photo.jpg',
  );
  return form;
};
const login = (role) =>
  call(
    `login:${role}`,
    apiRoutes.login.path,
    null,
    'POST',
    {
      email: `${role}@northbean.example`,
      password: 'northbean-demo',
    },
    201,
  );
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/^(id|token)$|Ids?$|At$/.test(key))
        .map(([key, entry]) => [key, normalize(entry)]),
    );
  if (typeof value === 'string') {
    if (value.startsWith(`${baseUrl}/storage/`)) {
      const url = new URL(value);
      return `${url.origin}${decodeURIComponent(url.pathname).replace(uuid, '<id>')}`;
    }
    return value.replace(uuid, '<id>');
  }
  return value;
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (startupError || api.exitCode !== null)
      throw new Error('槽位 API 启动失败。');
    try {
      ready = (await fetch(`${baseUrl}/health`)).ok;
    } catch {
      /* starting */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('槽位 API 启动超时。');
  for (const role of userRoles) tokens[role] = (await login(role)).token;
  const today = await call('setup:today', apiRoutes.today.path, 'inspector');
  let detail;
  let evidence;
  let inspection;
  for (const [key, route] of Object.entries(apiRoutes)) {
    if (key === 'login') continue; // The three real logins above cover this route.
    if (key === 'submitInspection') {
      for (const item of detail.items) {
        await call(
          `prepare:${item.position}`,
          `/api/inspections/${inspection.id}/items/${item.id}`,
          'inspector',
          'PATCH',
          { result: item.title.includes('冷柜') ? 'fail' : 'pass' },
        );
        if (item.photoRequired)
          await call(
            `photo:${item.position}`,
            `/api/inspections/${inspection.id}/items/${item.id}/evidence`,
            'inspector',
            'POST',
            photo(),
            201,
          );
      }
    }
    for (const role of userRoles) {
      const pathname = route.path
        .replace(
          ':id',
          key === 'getEvidence' ? evidence.id : (inspection?.id ?? ''),
        )
        .replace(':itemId', detail?.items[0].id ?? '');
      const bodies = {
        createInspection: { templateId: today.template.id },
        updateInspectionItem: { result: 'pass', note: 'snapshot-note' },
        addEvidence: photo(),
        reviewInspection: { action: 'start' },
      };
      const allowed = route.roles.includes(role);
      const result = await call(
        `${key}:${role}`,
        pathname,
        role,
        route.method,
        bodies[key],
        allowed ? route.successStatus : 403,
      );
      if (allowed) {
        route.responseSchema.parse(result);
        if (key === 'createInspection') inspection = result;
        if (key === 'getInspection' && !detail) detail = result;
        if (key === 'addEvidence') evidence = result;
      }
    }
  }
  const detailPath = `/api/inspections/${inspection.id}`;
  const review = (label, body) =>
    call(label, `${detailPath}/review`, 'supervisor', 'POST', body, 201);
  await review('demo:rework', {
    action: 'rework',
    reworkItemIds: [detail.items[0].id],
    comment: 'snapshot-rework',
  });
  await call('demo:today-rework', apiRoutes.today.path, 'inspector');
  for (const item of detail.items) {
    await call(
      `demo:pass:${item.position}`,
      `${detailPath}/items/${item.id}`,
      'inspector',
      'PATCH',
      { result: 'pass' },
    );
  }
  await call(
    'demo:replacement',
    `${detailPath}/items/${detail.items[0].id}/evidence`,
    'inspector',
    'POST',
    photo(),
    201,
  );
  const submitted = await call(
    'demo:resubmit',
    `${detailPath}/submit`,
    'inspector',
    'POST',
    undefined,
    201,
  );
  if (submitted.score !== 100) throw new Error('演示链重新提交应为 100。');
  await review('demo:start', { action: 'start' });
  await review('demo:approve', { action: 'approve' });
  await call('demo:final-detail', detailPath, 'inspector');
  const dashboard = await call(
    'demo:dashboard',
    apiRoutes.dashboardSites.path,
    'hq',
  );
  if (dashboard.find((row) => row.site.code === 'NB-001')?.latestScore !== 100)
    throw new Error('演示链看板应显示 100。');
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await writeFile(output, `${JSON.stringify(normalize(records), null, 2)}\n`);
  console.log(
    `快照完成：${records.length} 次请求；12 个路由 × 3 个角色；${output}`,
  );
} finally {
  stopApi();
  await resetSlotResources(); // Remove all snapshot writes and uploaded files.
}
