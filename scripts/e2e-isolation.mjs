import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { register } from 'tsx/esm/api';

register();
const { createPool } = await import('../apps/api/src/db/client.ts');
const commands = [
  ['api', ['--filter', '@apps/api', 'test']],
  ['e2e', ['e2e']],
  ['web', ['exec', 'playwright', 'test', '--config=playwright.web.config.ts']],
  ['mobile', ['e2e:mobile']],
  ['cors', ['e2e:cors']],
  ['demo', ['e2e:demo']],
  ['demo-ui', ['e2e:demo-ui']],
];
const directory = 'logs/e2e-isolation';
await mkdir(directory, { recursive: true });
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const baseEnv = {
  ...process.env,
  NO_PROXY: '127.0.0.1,localhost',
  no_proxy: '127.0.0.1,localhost',
};

async function developmentSnapshot() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (decodeURIComponent(url.username) !== 'floorwalk') {
    throw new Error('只允许 floorwalk 角色。');
  }
  url.pathname = '/floorwalk';
  const pool = createPool(url.toString());
  try {
    const tables = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'floorwalk' ORDER BY tablename",
    );
    const snapshot = [];
    for (const { tablename } of tables.rows) {
      const identifier = `"${tablename.replaceAll('"', '""')}"`;
      const { rows } = await pool.query(
        `SELECT row_to_json(t)::text AS row FROM floorwalk.${identifier} t ORDER BY row_to_json(t)::text`,
      );
      snapshot.push({
        table: tablename,
        count: rows.length,
        hash: createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
      });
    }
    return snapshot;
  } finally {
    await pool.end();
  }
}

function listeners(slot, stop) {
  if (process.platform !== 'win32') {
    throw new Error('本隔离门当前使用 Windows 端口清理。');
  }
  const ports = [0, 1, 2].map((offset) => 3100 + slot * 10 + offset);
  const script = `$owners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(${ports.join(',')}) } | Select-Object -ExpandProperty OwningProcess -Unique); ${stop ? '$owners | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }' : 'if ($owners.Count) { Write-Error "槽位端口已有监听，不接管"; exit 1 }'}`;
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', script],
    {
      stdio: 'inherit',
      windowsHide: true,
    },
  );
  if (result.status !== 0) throw new Error(`槽位 ${slot} 端口检查失败。`);
}

function run(args, env, filename, requireMissingSlot = false) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(`${directory}/${filename}.log`);
    let message = '';
    const child = spawn(pnpm, args, {
      env,
      shell: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (chunk) => {
        output.write(chunk);
        if (requireMissingSlot) message += chunk;
      });
    }
    child.on('error', reject);
    child.on('close', (code) => {
      output.end();
      const passed = requireMissingSlot
        ? code !== 0 && /FW_SLOT/.test(message)
        : code === 0;
      console.log(
        `${filename}: ${passed ? 'passed' : 'FAILED'} (exit ${code})`,
      );
      if (passed) resolve({ filename, code });
      else reject(new Error(`${filename} 失败，见日志。`));
    });
  });
}

for (const slot of [1, 2, 3]) listeners(slot, false);
const before = await developmentSnapshot();
await writeFile(`${directory}/development-before.json`, JSON.stringify(before));
const noSlotEnv = { ...baseEnv };
delete noSlotEnv.FW_SLOT;
for (const [name, args] of commands) {
  await run(args, noSlotEnv, `missing-slot-${name}`, true);
}
const results = await Promise.allSettled(
  [1, 2, 3].map(async (slot) => {
    const result = [];
    for (const [name, args] of commands) {
      try {
        result.push(
          await run(
            args,
            { ...baseEnv, FW_SLOT: String(slot) },
            `slot-${slot}-${name}`,
          ),
        );
      } finally {
        // Resolve listeners, not just shell wrapper PIDs, before the next suite.
        listeners(slot, true);
      }
    }
    return result;
  }),
);
const after = await developmentSnapshot();
await writeFile(`${directory}/development-after.json`, JSON.stringify(after));
const unchanged = JSON.stringify(before) === JSON.stringify(after);
console.log(`development database unchanged: ${unchanged}`);
await writeFile(
  `${directory}/result.json`,
  JSON.stringify({ results, unchanged }, null, 2),
);
if (!unchanged || results.some((result) => result.status === 'rejected')) {
  process.exitCode = 1;
}
