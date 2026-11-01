// Starts, stops and reports long-running dev processes for one test slot.
// Executors (Codex, Claude Code, ...) call only this script for resident
// processes; PID files and logs live in the ignored .run/ directory.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const runDir = path.join(root, '.run');
const isWindows = process.platform === 'win32';

// Ports follow the slot rule in docs/howto/parallel.md: API 31N0, Metro 31N2.
const services = {
  metro: {
    port: (slot) => 3100 + slot * 10 + 2,
    cwd: path.join(root, 'apps/mobile'),
    args: (slot) => [
      'node_modules/expo/bin/cli',
      'start',
      '--lan',
      '--port',
      String(3100 + slot * 10 + 2),
    ],
    env: (slot) => ({
      EXPO_PUBLIC_API_BASE_URL: `http://127.0.0.1:${3100 + slot * 10}/api`,
      RCT_METRO_PORT: String(3100 + slot * 10 + 2),
      REACT_NATIVE_PACKAGER_HOSTNAME: '127.0.0.1',
    }),
    readyTimeoutMs: 120_000,
  },
};

function fail(message) {
  console.error(`proc: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const [command, name, ...rest] = argv;
  let slot;
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--slot') slot = Number(rest[(i += 1)]);
    else fail(`未知参数 ${rest[i]}`);
  }
  if (!['start', 'stop', 'status'].includes(command ?? '')) {
    fail(
      '用法：node scripts/dev/proc.mjs start|stop <服务> --slot N；status [<服务> --slot N]',
    );
  }
  if (command === 'status' && name === undefined) return { command };
  if (!services[name])
    fail(`未知服务 ${name}；可用：${Object.keys(services).join('、')}`);
  if (!Number.isInteger(slot) || slot < 1 || slot > 3)
    fail('--slot 必须是 1、2 或 3。');
  return { command, name, slot };
}

const recordPath = (name, slot) =>
  path.join(runDir, `${name}-slot-${slot}.json`);

function readRecord(name, slot) {
  const file = recordPath(name, slot);
  return fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : undefined;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isListening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

// Owner PIDs of a listening port, for reporting only; never killed here.
function listeningOwners(port) {
  if (!isWindows) return [];
  const out = spawnSync('netstat', ['-ano', '-p', 'TCP'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const owners = new Set();
  for (const line of (out.stdout ?? '').split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    if (cols[3] === 'LISTENING' && cols[1]?.endsWith(`:${port}`))
      owners.add(Number(cols[4]));
  }
  return [...owners];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function start(name, slot) {
  const service = services[name];
  const port = service.port(slot);
  const existing = readRecord(name, slot);
  if (existing && isAlive(existing.pid)) {
    fail(`${name} 槽位 ${slot} 已在运行（PID ${existing.pid}）；先 stop。`);
  }
  if (await isListening(port)) {
    fail(
      `端口 ${port} 已被占用（PID ${listeningOwners(port).join(',') || '未知'}），不是本脚本登记的进程，不处理。`,
    );
  }
  fs.mkdirSync(runDir, { recursive: true });
  const logFile = path.join(runDir, `${name}-slot-${slot}.log`);
  const log = fs.openSync(logFile, 'w');
  const child = spawn(process.execPath, service.args(slot), {
    cwd: service.cwd,
    env: { ...process.env, ...service.env(slot) },
    detached: true,
    stdio: ['ignore', log, log],
    windowsHide: true,
  });
  child.unref();
  fs.closeSync(log);
  const record = {
    name,
    slot,
    pid: child.pid,
    port,
    log: path.relative(root, logFile),
    startedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    recordPath(name, slot),
    `${JSON.stringify(record, null, 2)}\n`,
  );

  const deadline = Date.now() + service.readyTimeoutMs;
  while (Date.now() < deadline) {
    if (await isListening(port)) {
      console.log(
        `started ${name} slot=${slot} pid=${child.pid} port=${port} log=${record.log}`,
      );
      return;
    }
    if (!isAlive(child.pid)) break;
    await sleep(1000);
  }
  await stopTree(child.pid);
  fs.rmSync(recordPath(name, slot), { force: true });
  fail(
    `${name} 未在 ${service.readyTimeoutMs / 1000} 秒内监听 ${port}；已停止，日志见 ${record.log}`,
  );
}

async function stopTree(pid) {
  if (!isAlive(pid)) return;
  if (isWindows) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      // Process group already gone.
    }
  }
}

async function stop(name, slot) {
  const record = readRecord(name, slot);
  if (!record) {
    const port = services[name].port(slot);
    if (await isListening(port)) {
      fail(
        `没有 ${name} 槽位 ${slot} 的登记，但端口 ${port} 在监听（PID ${listeningOwners(port).join(',') || '未知'}），不处理。`,
      );
    }
    console.log(`stopped ${name} slot=${slot} (未在运行)`);
    return;
  }
  await stopTree(record.pid);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline && (await isListening(record.port)))
    await sleep(500);
  fs.rmSync(recordPath(name, slot), { force: true });
  if (await isListening(record.port)) {
    fail(
      `已停进程树 ${record.pid}，端口 ${record.port} 仍在监听（PID ${listeningOwners(record.port).join(',') || '未知'}），请人工确认。`,
    );
  }
  console.log(
    `stopped ${name} slot=${slot} pid=${record.pid} port=${record.port} released`,
  );
}

async function status(name, slot) {
  const targets = name
    ? [[name, slot]]
    : Object.keys(services).flatMap((n) => [1, 2, 3].map((s) => [n, s]));
  for (const [n, s] of targets) {
    const record = readRecord(n, s);
    const port = services[n].port(s);
    const listening = await isListening(port);
    if (!record && !listening && name === undefined) continue;
    const alive = record ? isAlive(record.pid) : false;
    console.log(
      `${n} slot=${s} port=${port} listening=${listening} registered=${Boolean(record)}` +
        (record ? ` pid=${record.pid} alive=${alive}` : '') +
        (listening && !record
          ? ` owner=${listeningOwners(port).join(',') || '未知'}`
          : ''),
    );
  }
}

const { command, name, slot } = parseArgs(process.argv.slice(2));
if (command === 'start') await start(name, slot);
else if (command === 'stop') await stop(name, slot);
else await status(name, slot);
