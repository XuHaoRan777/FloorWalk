import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const expectedFailures = new Map([
  [
    'console.spec.ts::管理员进入审核队列，店长 Web 端只显示手机端提示',
    (messages) =>
      messages.includes('locator.click') && messages.includes('退出登录'),
  ],
  [
    'console.spec.ts::会话 ID 不暴露给脚本，刷新保持登录，退出后失效',
    (messages) =>
      messages.includes('locator.click') && messages.includes('退出登录'),
  ],
  [
    'orgs.spec.ts::FW-025 AC-06 Web 注册与管理员密码找回',
    (messages) =>
      messages.includes('locator.click') && messages.includes('退出登录'),
  ],
  [
    'ui-foundation.spec.ts::FW-041 AC-07 登录后五屏三宽截图',
    (messages) =>
      messages.includes('Expected: >= 2') && messages.includes('Received:    1'),
  ],
  [
    'users.spec.ts::FW-024 AC-08 管理员创建店长并完成首次改密',
    (messages) => messages.includes('Test timeout of 120000ms exceeded'),
  ],
]);
const skippedTest =
  'ui-foundation.spec.ts::FW-016 AC-05 公开页面 inspector';

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      shell: process.platform === 'win32',
      stdio: 'inherit',
      windowsHide: true,
    });

    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });
}

function collectTests(suites, tests = []) {
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) {
      const file = path.posix.basename(spec.file.replaceAll('\\', '/'));
      const result = spec.tests[0];
      tests.push({
        name: `${file}::${spec.title}`,
        status: result.status,
        messages: (result.results ?? [])
          .flatMap((attempt) => [
            attempt.error?.message,
            ...(attempt.errors ?? []).map((error) => error.message ?? error),
          ])
          .filter(Boolean)
          .map((message) => String(message).replace(/\u001b\[[0-9;]*m/g, ''))
          .join('\n'),
      });
    }
    collectTests(suite.suites ?? [], tests);
  }

  return tests;
}

function compareWebBaseline(report) {
  const tests = collectTests(report.suites);
  const passed = tests.filter((test) => test.status === 'expected').length;
  const failed = tests.filter((test) => test.status === 'unexpected');
  const skipped = tests.filter((test) => test.status === 'skipped');
  const flaky = tests.filter((test) => test.status === 'flaky');
  const problems = [];

  if (
    tests.length !== 40 ||
    passed !== 34 ||
    failed.length !== 5 ||
    skipped.length !== 1 ||
    flaky.length !== 0
  ) {
    problems.push(
      `计数变化：${passed} passed、${failed.length} failed、${skipped.length} skipped、${flaky.length} flaky，共 ${tests.length} 项。`,
    );
  }

  const actualFailures = new Set(failed.map((test) => test.name));
  for (const [name, matchesError] of expectedFailures) {
    if (!actualFailures.has(name)) {
      problems.push(`失败用例身份变化或缺失：${name}`);
      continue;
    }

    const failure = failed.find((test) => test.name === name);
    if (!matchesError(failure.messages)) {
      problems.push(`失败现象变化：${name}`);
    }
  }

  for (const failure of failed) {
    if (!expectedFailures.has(failure.name)) {
      problems.push(`出现新的失败：${failure.name}`);
    }
  }

  if (skipped.length !== 1 || skipped[0]?.name !== skippedTest) {
    problems.push(
      `跳过项变化：${skipped.map((test) => test.name).join(', ') || '无'}`,
    );
  }

  if (problems.length > 0) {
    console.error('Web E2E 与开单前基线不一致：');
    for (const problem of problems) console.error(`- ${problem}`);
    return false;
  }

  console.log(
    'Web E2E 基线一致：40 项，34 passed、5 个预期失败、1 个预期跳过。',
  );
  return true;
}

async function runMobileE2e() {
  const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const code = await run(packageManager, ['e2e:mobile'], {
    ...process.env,
    FW_SLOT: '1',
  });
  process.exitCode = code;
}

async function runWebBaseline() {
  const reportFile = path.resolve(
    'tests/web-results/slot-3/fw047-web-baseline.json',
  );
  const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  await mkdir(path.dirname(reportFile), { recursive: true });
  const code = await run(
    packageManager,
    [
      'exec',
      'playwright',
      'test',
      '--config=playwright.web.config.ts',
      '--reporter=json',
    ],
    {
      ...process.env,
      FW_SLOT: '3',
      PLAYWRIGHT_JSON_OUTPUT_NAME: reportFile,
    },
  );

  let report;
  try {
    report = JSON.parse(await readFile(reportFile, 'utf8'));
  } catch (error) {
    console.error(`无法读取 Web E2E JSON 报告：${error.message}`);
    process.exitCode = code === 0 ? 1 : code;
    return;
  }

  if (!compareWebBaseline(report)) {
    process.exitCode = 1;
    return;
  }

  process.exitCode = 0;
}

const mode = process.argv[2];
if (mode === 'mobile') {
  await runMobileE2e();
} else if (mode === 'web-baseline') {
  await runWebBaseline();
} else {
  console.error('用法：node scripts/e2e-gates.mjs <mobile|web-baseline>');
  process.exitCode = 2;
}
