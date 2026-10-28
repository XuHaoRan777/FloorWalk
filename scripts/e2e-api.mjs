import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const slot = Number(process.env.FW_SLOT);
if (!Number.isInteger(slot) || slot < 1 || slot > 3) {
  throw new Error('FW_SLOT 必须设置为 1、2 或 3。');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = path.join(root, 'apps/api');
const output = `.e2e/slot-${slot}/dist`;
// Each slot compiles and runs its own files; Nest's default dist is shared.
// The workspace shared package must already be built, as for the API tests.
const build = spawnSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '--outDir', output],
  { cwd: apiRoot, env: process.env, stdio: 'inherit', windowsHide: true },
);
if (build.status !== 0) process.exit(build.status ?? 1);
const api = spawn(process.execPath, [`${output}/main.js`], {
  cwd: apiRoot,
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
});
api.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
api.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => api.kill(signal));
}
