import { spawn } from 'node:child_process';

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const children = [1, 2, 3].map((slot) => {
  const child = spawn(command, ['e2e'], {
    env: { ...process.env, FW_SLOT: String(slot) },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
  child.stdout.on('data', (chunk) =>
    process.stdout.write(`[slot ${slot}] ${chunk}`),
  );
  child.stderr.on('data', (chunk) =>
    process.stderr.write(`[slot ${slot}] ${chunk}`),
  );
  return new Promise((resolve) =>
    child.on('close', (code) => resolve(code ?? 1)),
  );
});

const exitCodes = await Promise.all(children);
process.exitCode = exitCodes.every((code) => code === 0) ? 0 : 1;
