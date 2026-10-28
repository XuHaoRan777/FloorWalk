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
  NODE_ENV: 'development',
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
const sessionCookies = new Map();
const json = (body) => ({ 'content-type': 'application/json', ...body });
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
async function call(
  label,
  pathname,
  role,
  method = 'GET',
  body,
  expected = 200,
) {
  const headers = role ? { cookie: sessionCookies.get(role) } : {};
  if (role && !headers.cookie) throw new Error(`缺少 ${role} 会话 cookie。`);
  const multipart = body instanceof FormData;
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body && !multipart ? json(headers) : headers,
    body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
  });
  const result = response.status === 204 ? undefined : await response.json();
  if (response.status !== expected)
    throw new Error(`${label}: 预期 ${expected}，得到 ${response.status}`);
  records.push({ label, status: response.status, body: result });
  if (method === 'DELETE' && pathname === apiRoutes.deleteSession.path)
    sessionCookies.delete(role);
  return result;
}
async function login(role) {
  const response = await fetch(`${baseUrl}${apiRoutes.createSession.path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `${role}@northbean.example`,
      password: 'northbean-demo',
    }),
  });
  if (response.status !== apiRoutes.createSession.successStatus)
    throw new Error(
      `login:${role}: 预期 ${apiRoutes.createSession.successStatus}，得到 ${response.status}`,
    );
  const result = await response.json();
  apiRoutes.createSession.responseSchema.parse(result);
  sessionCookies.set(role, readSessionCookie(response));
  records.push({
    label: `login:${role}`,
    status: response.status,
    body: result,
  });
  return result;
}
async function cleanupSessions() {
  let failed = false;
  for (const [role, cookie] of sessionCookies) {
    try {
      const response = await fetch(
        `${baseUrl}${apiRoutes.deleteSession.path}`,
        { method: 'DELETE', headers: { cookie } },
      );
      if (response.status !== apiRoutes.deleteSession.successStatus)
        failed = true;
    } catch {
      failed = true;
    }
  }
  sessionCookies.clear();
  if (failed) throw new Error('无法清理快照会话。');
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
  for (const role of userRoles) await login(role);
  const today = await call('setup:today', apiRoutes.today.path, 'inspector');
  const sites = await call(
    'seed:sites',
    apiRoutes.listAdminSites.path,
    'supervisor',
  );
  const templates = await call(
    'seed:templates',
    apiRoutes.listAdminTemplates.path,
    'hq',
  );
  if (sites.length !== 12 || sites.some((site) => !site.active))
    throw new Error('种子应有 12 家启用门店。');
  if (
    templates.filter((template) => template.isCurrent).length !== 1 ||
    !today.site.active ||
    today.template.id !== templates.find((template) => template.isCurrent).id
  )
    throw new Error('种子当前模板或 today 字段不符合契约。');
  await login('inspector+nb-002');
  const seededRecords = await call(
    'seed:records',
    apiRoutes.listInspectorInspections.path,
    'inspector+nb-002',
  );
  const seededRework = seededRecords.items.find(
    (item) => item.status === 'rework',
  );
  if (!seededRework) throw new Error('种子 NB-002 缺打回单。');
  const seededChat = await call(
    'seed:chat',
    `/api/inspections/${seededRework.id}/messages`,
    'inspector+nb-002',
  );
  apiRoutes.listInspectionMessages.responseSchema.parse(seededChat);
  if (
    seededChat.messages.length !== 2 ||
    !seededChat.messages.some(
      (message) => message.role === 'supervisor' && message.body,
    ) ||
    !seededChat.messages.some(
      (message) => message.role === 'inspector' && message.imageUrl,
    )
  )
    throw new Error('NB-002 种子聊天应为主管文字与店员图片。');
  const seedImage = seededChat.messages.find((message) => message.imageUrl);
  const signed = new URL(seedImage.imageUrl);
  const image = await fetch(`${baseUrl}${signed.pathname}${signed.search}`);
  const imageBytes = new Uint8Array(await image.arrayBuffer());
  if (
    !image.ok ||
    image.headers.get('content-type') !== 'image/jpeg' ||
    imageBytes[0] !== 0xff ||
    imageBytes[1] !== 0xd8
  )
    throw new Error('种子聊天图片必须能通过签名读取真实 JPEG。');
  records.push({
    label: 'seed:image',
    status: image.status,
    body: { mime: 'image/jpeg', bytes: imageBytes.length },
  });
  let detail;
  let evidence;
  let inspection;
  let chatMessage;
  for (const [key, route] of Object.entries(apiRoutes)) {
    if (key === 'createSession' || key === 'deleteSession') continue;
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
          key === 'getEvidence'
            ? evidence.id
            : key === 'getMessageImageUrl'
              ? chatMessage.id
              : key === 'updateAdminSite'
                ? sites[0].id
                : ['updateAdminTemplate', 'setCurrentAdminTemplate'].includes(
                      key,
                    )
                  ? templates[0].id
                  : (inspection?.id ?? ''),
        )
        .replace(':itemId', detail?.items[0].id ?? '');
      const bodies = {
        createInspection: { templateId: today.template.id },
        updateInspectionItem: { result: 'pass', note: 'snapshot-note' },
        addEvidence: photo(),
        reviewInspection: { action: 'start' },
        createInspectionMessage: photo(),
        createAdminSite: { code: 'SNAPSHOT', name: 'Snapshot site' },
        updateAdminSite: { name: 'Snapshot renamed', active: false },
        createAdminTemplate: {
          name: 'Snapshot template',
          items: [
            { title: 'Snapshot item', photoRequired: false, critical: false },
          ],
        },
        updateAdminTemplate: {
          name: 'Snapshot template',
          items: [
            {
              position: 1,
              title: 'Snapshot item',
              photoRequired: false,
              critical: false,
            },
          ],
        },
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
        if (key === 'createInspectionMessage') chatMessage = result;
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
  for (const role of userRoles) {
    const result = await call(
      `deleteSession:${role}`,
      apiRoutes.deleteSession.path,
      role,
      'DELETE',
      undefined,
      apiRoutes.deleteSession.successStatus,
    );
    apiRoutes.deleteSession.responseSchema.parse(result);
  }
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await writeFile(output, `${JSON.stringify(normalize(records), null, 2)}\n`);
  console.log(
    `快照完成：${records.length} 次请求；${Object.keys(apiRoutes).length} 个路由 × 3 个角色；${output}`,
  );
} finally {
  try {
    await cleanupSessions();
  } finally {
    stopApi();
    await resetSlotResources(); // Remove all snapshot writes and uploaded files.
  }
}
