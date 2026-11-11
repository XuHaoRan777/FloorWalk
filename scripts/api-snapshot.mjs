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
const database = createPool(databaseUrl.toString());
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
  const responseText = response.status === 204 ? '' : await response.text();
  let result;
  try {
    result = responseText ? JSON.parse(responseText) : undefined;
  } catch {
    result = responseText;
  }
  if (response.status !== expected)
    throw new Error(
      `${label}: 预期 ${expected}，得到 ${response.status}: ${JSON.stringify(result)}`,
    );
  records.push({ label, status: response.status, body: result });
  if (pathname === apiRoutes.createOrg.path && response.status === 201)
    sessionCookies.set('createdOrg', readSessionCookie(response));
  if (method === 'DELETE' && pathname === apiRoutes.deleteSession.path)
    sessionCookies.delete(role);
  return result;
}
async function login(role, orgId) {
  const loginName =
    role === 'admin'
      ? 'hq@northbean.example'
      : role === 'store_manager_nb002'
        ? 'inspector+nb-002@northbean.example'
        : 'inspector@northbean.example';
  const response = await fetch(`${baseUrl}${apiRoutes.createSession.path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      loginName,
      password: 'northbean-demo',
      ...(orgId ? { orgId } : {}),
    }),
  });
  if (response.status !== apiRoutes.createSession.successStatus)
    throw new Error(
      `login:${role}: 预期 ${apiRoutes.createSession.successStatus}，得到 ${response.status}`,
    );
  const result = await response.json();
  apiRoutes.createSession.responseSchema.parse(result);
  if (!result.user) throw new Error(`login:${role}: 登录响应缺少组织选择。`);
  sessionCookies.set(role, readSessionCookie(response));
  records.push({
    label: `login:${role}`,
    status: response.status,
    body: result,
  });
  return result;
}
async function mailboxCode(email) {
  const response = await fetch(
    `${baseUrl}/api/testing/mailbox?recipient=${encodeURIComponent(email)}`,
  );
  if (!response.ok) throw new Error(`未读到 ${email} 的测试验证码。`);
  return (await response.json()).code;
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
const photo = (item, selfAssessment = 'pass') => {
  const form = new FormData();
  form.append('selfAssessment', selfAssessment);
  if (!item.minPhotoCount) form.append('note', '快照检查已完成。');
  for (let index = 0; index < item.minPhotoCount; index += 1)
    form.append(
      'files',
      new Blob([`snapshot-photo-${item.position}-${index}`], {
        type: 'image/jpeg',
      }),
      `photo-${item.position}-${index}.jpg`,
    );
  return form;
};

function localDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function scheduleDefinition(name, templateId, taskDate = localDate()) {
  const weekday = new Date(`${taskDate}T12:00:00+08:00`).getUTCDay() || 7;
  return {
    name,
    days: Array.from({ length: 7 }, (_, index) => ({
      weekday: index + 1,
      enabled: true,
      tasks:
        index + 1 === weekday
          ? [{ templateId, startsAt: '00:00', endsAt: '23:59' }]
          : [],
    })),
  };
}
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/^(id|token|resetToken)$|Ids?$|At$/.test(key))
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
  const adminLogin = await login('admin');
  const orgId = adminLogin.user.org.id;
  await login('store_manager', orgId);
  await login('store_manager_nb002', orgId);
  const today = await call(
    'setup:today',
    apiRoutes.today.path,
    'store_manager',
  );
  const sites = await call(
    'seed:sites',
    apiRoutes.listAdminSites.path,
    'admin',
  );
  const templates = await call(
    'seed:templates',
    apiRoutes.listAdminTemplates.path,
    'admin',
  );
  const northbeanCodes = sites
    .filter((site) => site.code.startsWith('NB-'))
    .map((site) => site.code)
    .sort();
  const expectedNorthbeanCodes = Array.from(
    { length: 12 },
    (_, index) => `NB-${String(index + 1).padStart(3, '0')}`,
  );
  if (
    sites.length !== 12 ||
    JSON.stringify(northbeanCodes) !== JSON.stringify(expectedNorthbeanCodes) ||
    sites.some((site) => !site.active)
  )
    throw new Error('Northbean 管理员应只看到 12 家启用门店。');
  const template = today.templates.find((entry) => entry.name === '开店检查');
  if (
    !today.site.active ||
    !template ||
    !templates.some((entry) => entry.id === template.id)
  )
    throw new Error('种子模板或 today 字段不符合契约。');
  const site = sites.find((entry) => entry.code === 'NB-001');
  if (!site || !template) throw new Error('缺少 NB-001 门店或开店检查模板。');

  const seededInspectionResult = await database.query(
    `SELECT inspection.id FROM floorwalk.inspections inspection
     JOIN floorwalk.sites site ON site.id = inspection.site_id
     JOIN floorwalk.chat_messages message ON message.inspection_id = inspection.id
     WHERE site.org_id = $1 AND site.code = 'NB-002'
     ORDER BY inspection.created_at DESC, inspection.id DESC LIMIT 1`,
    [orgId],
  );
  const seededInspectionId = seededInspectionResult.rows[0]?.id;
  if (!seededInspectionId) throw new Error('NB-002 缺少带聊天的种子巡检。');
  const seededChat = await call(
    'seed:chat',
    `/api/inspections/${seededInspectionId}/messages`,
    'store_manager_nb002',
  );
  apiRoutes.listInspectionMessages.responseSchema.parse(seededChat);
  if (
    seededChat.messages.length !== 2 ||
    !seededChat.messages.some(
      (message) => message.role === 'admin' && message.body,
    ) ||
    !seededChat.messages.some(
      (message) => message.role === 'store_manager' && message.imageUrl,
    )
  )
    throw new Error('NB-002 种子聊天应包含管理员文字与店长图片。');
  const seedImage = seededChat.messages.find((message) => message.imageUrl);
  const seedImageUrl = await call(
    'seed:image-url',
    apiRoutes.getMessageImageUrl.path.replace(':id', seedImage.id),
    'store_manager_nb002',
  );
  const signed = new URL(seedImageUrl.url);
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

  const taskDate = localDate();
  const setupSchedule = await call(
    'setup:schedule',
    apiRoutes.createAdminSchedule.path,
    'admin',
    'POST',
    scheduleDefinition('API 快照日程', template.id, taskDate),
    apiRoutes.createAdminSchedule.successStatus,
  );
  await call(
    'setup:assign-schedule',
    apiRoutes.assignAdminSiteSchedule.path,
    'admin',
    'PUT',
    { siteIds: [site.id], scheduleId: setupSchedule.id },
    apiRoutes.assignAdminSiteSchedule.successStatus,
  );
  const taskStartsAt = new Date(`${taskDate}T00:00:00+08:00`);
  const taskDueAt = new Date(`${taskDate}T23:59:00+08:00`);
  const taskResult = await database.query(
    `SELECT id FROM floorwalk.inspection_tasks
     WHERE org_id = $1 AND site_id = $2 AND template_id = $3
       AND task_date = $4::date AND starts_at = $5 AND due_at = $6
     ORDER BY position, occurrence LIMIT 1`,
    [orgId, site.id, template.id, taskDate, taskStartsAt, taskDueAt],
  );
  const taskId = taskResult.rows[0]?.id;
  if (!taskId) throw new Error('当天日程未为 NB-001 生成巡检任务。');
  await database.query(
    `UPDATE floorwalk.inspection_tasks
     SET starts_at = $2, due_at = $3 WHERE id = $1`,
    [
      taskId,
      new Date(Date.now() - 60 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
    ],
  );

  const uploadItem =
    template.items.find((item) => item.minPhotoCount > 0) ?? template.items[0];
  if (!uploadItem) throw new Error('当天任务没有检查项。');
  const upload = (label, item, assessment = 'pass') =>
    call(
      label,
      apiRoutes.uploadTaskItem.path
        .replace(':taskId', taskId)
        .replace(':position', String(item.position)),
      'store_manager',
      'POST',
      photo(item, assessment),
      apiRoutes.uploadTaskItem.successStatus,
    );
  await upload('setup:first-upload', uploadItem);
  let taskReview = await call(
    'setup:task-review',
    apiRoutes.getTaskReview.path.replace(':taskId', taskId),
    'admin',
  );
  const inspectionId = taskReview.inspectionId;
  const inspection = await database.query(
    'SELECT id FROM floorwalk.inspections WHERE task_id = $1',
    [taskId],
  );
  if (!inspectionId || inspection.rows[0]?.id !== inspectionId)
    throw new Error('首传没有生成任务巡检关联。');
  let evidence = taskReview.items
    .flatMap((item) => item.evidence)
    .find((item) => item);
  const snapshotDecisionItem = taskReview.items.find(
    (item) =>
      item.id === uploadItem.id || item.position === uploadItem.position,
  );
  if (!snapshotDecisionItem || !evidence)
    throw new Error('首传未返回用于路由快照的条目或照片。');
  const reworkItem = taskReview.items.find(
    (item) => item.id !== snapshotDecisionItem.id,
  );
  if (!reworkItem) throw new Error('任务至少需要两个检查项以覆盖改判流程。');

  let snapshotUserId;
  let matrixScheduleId;
  let matrixTemplateId;
  let matrixAiStandardId;
  let scheduleSkipId;
  let chatMessage;
  const registrationEmail = 'snapshot-registration@example.test';
  const recoveryEmail = 'admin@demo2.example';
  let registrationCode;
  let recoveryCode;
  let recoveryToken;
  let recoveryOrgId;
  const registrationCodeBody = { email: registrationEmail };
  const recoveryCodeBody = { email: recoveryEmail };
  const makeChatPhoto = () => {
    const form = new FormData();
    form.append(
      'file',
      new Blob(['snapshot-chat-photo'], { type: 'image/jpeg' }),
      'snapshot-chat.jpg',
    );
    return form;
  };
  const scheduleBody = scheduleDefinition(
    'API 快照矩阵日程',
    template.id,
    taskDate,
  );
  const updatedScheduleBody = {
    ...scheduleBody,
    name: 'API 快照矩阵日程已修改',
  };
  const templateBody = {
    name: 'API 快照模板',
    aiEnabled: false,
    aiStandardId: null,
    items: [
      {
        title: '快照条目',
        minPhotoCount: 0,
        acceptanceCriteria: '',
        critical: false,
      },
    ],
  };
  function routeBody(key, role) {
    switch (key) {
      case 'requestRegistrationCode':
        return registrationCodeBody;
      case 'requestPasswordRecoveryCode':
        return recoveryCodeBody;
      case 'verifyPasswordRecoveryCode':
        return { email: recoveryEmail, code: recoveryCode };
      case 'resetPasswordRecovery':
        return {
          resetToken: recoveryToken,
          orgId: recoveryOrgId,
          password: 'snapshot-recovery-password',
        };
      case 'createOrg':
        return {
          orgName: 'Snapshot organization',
          adminName: 'Snapshot admin',
          email: registrationEmail,
          verificationCode: registrationCode,
          password: 'snapshot-org-password',
        };
      case 'changePassword':
        return {
          currentPassword:
            role === 'admin' ? 'northbean-demo' : 'northbean-demo',
          newPassword: 'snapshot-password',
        };
      case 'createAdminUser':
        return {
          loginName: 'api-snapshot-user@example.test',
          displayName: 'API 快照用户',
          role: 'store_manager',
          siteId: site.id,
          password: 'snapshot-user-password',
        };
      case 'updateAdminUser':
        return { displayName: 'API 快照用户已修改' };
      case 'resetAdminUserPassword':
        return { password: 'snapshot-user-reset-password' };
      case 'uploadTaskItem':
        return photo(uploadItem);
      case 'decideTaskItem':
        return { result: 'pass' };
      case 'createInspectionMessage':
        return makeChatPhoto();
      case 'createAdminSite':
        return { code: 'SNAPSHOT', name: '快照门店' };
      case 'updateAdminSite':
        return { name: 'NB-001 快照名称' };
      case 'createAdminSchedule':
        return scheduleBody;
      case 'updateAdminSchedule':
        return updatedScheduleBody;
      case 'assignAdminSiteSchedule':
        return { siteIds: [site.id], scheduleId: setupSchedule.id };
      case 'addAdminSiteScheduleSkips':
        return {
          siteIds: [site.id],
          startsOn: taskDate,
          endsOn: taskDate,
          note: '快照临时跳过',
        };
      case 'createAdminTemplate':
        return templateBody;
      case 'updateAdminTemplate':
        return {
          ...templateBody,
          name: 'API 快照模板已修改',
          items: templateBody.items.map((item, index) => ({
            ...item,
            position: index + 1,
          })),
        };
      case 'createAdminAiStandard':
        return { name: 'API 快照标准', prompt: '检查条目是否符合现场标准。' };
      case 'updateAdminAiStandard':
        return {
          name: 'API 快照标准已修改',
          prompt: '检查条目及其现场证据是否符合标准。',
        };
      case 'quickSetupAdminTemplate':
        return { kind: 'coffee' };
      default:
        return undefined;
    }
  }
  function routePath(key, route) {
    const idByRoute = {
      getInspection: inspectionId,
      getEvidence: evidence.id,
      listInspectionMessages: inspectionId,
      createInspectionMessage: inspectionId,
      getMessageImageUrl: chatMessage?.id,
      updateAdminUser: snapshotUserId,
      resetAdminUserPassword: snapshotUserId,
      updateAdminSite: site.id,
      updateAdminSchedule: matrixScheduleId,
      deleteAdminSchedule: matrixScheduleId,
      deleteAdminSiteScheduleSkip: scheduleSkipId,
      updateAdminTemplate: matrixTemplateId,
      updateAdminAiStandard: matrixAiStandardId,
      deleteAdminAiStandard: matrixAiStandardId,
    };
    return route.path
      .replace(':id', idByRoute[key] ?? '')
      .replace(':taskId', taskId)
      .replace(':position', String(uploadItem.position))
      .replace(':itemId', snapshotDecisionItem.id);
  }

  let routeCoverageCount = 0;
  for (const [key, route] of Object.entries(apiRoutes)) {
    if (key === 'createSession' || key === 'deleteSession') continue;
    if (route.roles.length === 0) {
      const body = routeBody(key);
      const result = await call(
        `${key}:anonymous`,
        routePath(key, route),
        undefined,
        route.method,
        body,
        route.successStatus,
      );
      route.responseSchema.parse(result);
      routeCoverageCount += 1;
      if (key === 'requestRegistrationCode')
        registrationCode = await mailboxCode(registrationEmail);
      if (key === 'requestPasswordRecoveryCode')
        recoveryCode = await mailboxCode(recoveryEmail);
      if (key === 'verifyPasswordRecoveryCode') {
        recoveryToken = result.resetToken;
        recoveryOrgId = result.organizations[0]?.id;
      }
      continue;
    }
    for (const role of userRoles) {
      const pathname = routePath(key, route);
      const body = routeBody(key, role);
      const allowed = route.roles.includes(role);
      const result = await call(
        `${key}:${role}`,
        pathname,
        role,
        route.method,
        body,
        allowed ? route.successStatus : 403,
      );
      routeCoverageCount += 1;
      if (allowed) {
        route.responseSchema.parse(result);
        if (key === 'uploadTaskItem') {
          taskReview = await call(
            'matrix:task-review-after-upload',
            apiRoutes.getTaskReview.path.replace(':taskId', taskId),
            'admin',
          );
          evidence = taskReview.items
            .flatMap((item) => item.evidence)
            .find((item) => item);
        }
        if (key === 'createAdminUser') snapshotUserId = result.id;
        if (key === 'createAdminSchedule') matrixScheduleId = result.id;
        if (key === 'createAdminTemplate') matrixTemplateId = result.id;
        if (key === 'createAdminAiStandard') matrixAiStandardId = result.id;
        if (key === 'addAdminSiteScheduleSkips')
          scheduleSkipId = result
            .find((entry) => entry.siteId === site.id)
            .skippedRanges.at(-1).id;
        if (key === 'createInspectionMessage') chatMessage = result;
      }
    }
  }
  if (!registrationCode || !recoveryCode || !recoveryToken || !recoveryOrgId)
    throw new Error('公开邮箱验证码与找回路由没有完整执行。');

  taskReview = await call(
    'demo:task-review',
    apiRoutes.getTaskReview.path.replace(':taskId', taskId),
    'admin',
  );
  for (const item of taskReview.items) {
    if (!item.uploadedAt) await upload(`demo:upload:${item.position}`, item);
  }
  taskReview = await call(
    'demo:task-review-after-all-uploads',
    apiRoutes.getTaskReview.path.replace(':taskId', taskId),
    'admin',
  );
  const lastSnapshotItem = taskReview.items.find(
    (item) => item.id === reworkItem.id,
  );
  for (const item of taskReview.items) {
    if (item.id !== reworkItem.id && item.result !== 'pass')
      taskReview = await call(
        `demo:decision:${item.position}:pass`,
        apiRoutes.decideTaskItem.path
          .replace(':taskId', taskId)
          .replace(':itemId', item.id),
        'admin',
        'POST',
        { result: 'pass' },
        apiRoutes.decideTaskItem.successStatus,
      );
  }
  await call(
    'demo:decision:rework',
    apiRoutes.decideTaskItem.path
      .replace(':taskId', taskId)
      .replace(':itemId', lastSnapshotItem.id),
    'admin',
    'POST',
    { result: 'rework' },
    apiRoutes.decideTaskItem.successStatus,
  );
  await database.query(
    'UPDATE floorwalk.inspection_tasks SET due_at = $2 WHERE id = $1',
    [taskId, new Date(Date.now() - 1000)],
  );
  await upload('demo:rework-resubmit', lastSnapshotItem);
  const failedAtLock = await call(
    'demo:decision:lock-score',
    apiRoutes.decideTaskItem.path
      .replace(':taskId', taskId)
      .replace(':itemId', lastSnapshotItem.id),
    'admin',
    'POST',
    { result: 'fail' },
    apiRoutes.decideTaskItem.successStatus,
  );
  if (failedAtLock.score !== 88 || failedAtLock.inspectionStatus !== 'passed')
    throw new Error('截止判定应锁定 88 分并给出通过结论。');
  const rejudged = await call(
    'demo:decision:rejudge',
    apiRoutes.decideTaskItem.path
      .replace(':taskId', taskId)
      .replace(':itemId', lastSnapshotItem.id),
    'admin',
    'POST',
    { result: 'pass' },
    apiRoutes.decideTaskItem.successStatus,
  );
  if (rejudged.score !== 100 || rejudged.inspectionStatus !== 'passed')
    throw new Error('逐条改判后应重算为 100 分并通过。');
  await call(
    'demo:final-detail',
    apiRoutes.getInspection.path.replace(':id', inspectionId),
    'store_manager',
  );
  const dashboard = await call(
    'demo:dashboard',
    apiRoutes.dashboardSites.path,
    'admin',
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
  for (const role of ['store_manager_nb002', 'createdOrg']) {
    const cookie = sessionCookies.get(role);
    if (!cookie) continue;
    const response = await fetch(`${baseUrl}${apiRoutes.deleteSession.path}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    if (response.status !== apiRoutes.deleteSession.successStatus)
      throw new Error(`无法清理 ${role} 快照会话。`);
    sessionCookies.delete(role);
  }
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await writeFile(output, `${JSON.stringify(normalize(records), null, 2)}\n`);
  console.log(
    `快照完成：${records.length} 次请求；覆盖 ${routeCoverageCount} 次契约路由权限检查（${Object.keys(apiRoutes).length} 个路由）；${output}`,
  );
} finally {
  try {
    await cleanupSessions();
  } finally {
    try {
      stopApi();
    } finally {
      try {
        await database.end();
      } finally {
        await resetSlotResources(); // Remove snapshot writes and uploaded files.
      }
    }
  }
}
