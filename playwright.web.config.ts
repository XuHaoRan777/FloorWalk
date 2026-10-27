import { defineConfig } from '@playwright/test';
import { loadEnvFile } from 'node:process';

loadEnvFile('apps/api/.env.development');

const configuredSlot = process.env.FW_SLOT;
if (!configuredSlot) throw new Error('FW_SLOT 未设置；请设置为 1、2 或 3。');
const slot = Number(configuredSlot);
if (!Number.isInteger(slot) || slot < 1 || slot > 3)
  throw new Error('FW_SLOT 必须是 1、2 或 3。');

const apiPort = 3100 + slot * 10;
const webPort = apiPort + 1;
const projectRoot = process.cwd();
const slotDatabaseUrl = new URL(process.env.DATABASE_URL ?? '');
slotDatabaseUrl.pathname = `/floorwalk_e2e_${slot}`;
const slotEnvironment = {
  ...process.env,
  FW_SLOT: String(slot),
  PORT: String(apiPort),
  HOST: '127.0.0.1',
  DATABASE_URL: slotDatabaseUrl.toString(),
  STORAGE_DIR: `${projectRoot}/apps/api/.e2e/slot-${slot}/storage`,
  NODE_ENV: 'development',
};

const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: './tests/web',
  testMatch: '**/*.spec.ts',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  outputDir: `./tests/web-results/slot-${slot}`,
  reporter: [['line']],
  use: {
    baseURL: webUrl,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command:
        'pnpm --filter @libs/shared build && pnpm --filter @apps/api build && pnpm --filter @apps/api db:migrate && pnpm --filter @apps/api db:seed && pnpm --filter @apps/api start',
      cwd: projectRoot,
      url: `${apiUrl}/health`,
      timeout: 120_000,
      reuseExistingServer: true,
      env: slotEnvironment,
    },
    {
      command: `pnpm --filter @apps/web dev -- --host 127.0.0.1 --port ${webPort}`,
      cwd: projectRoot,
      url: webUrl,
      timeout: 120_000,
      reuseExistingServer: true,
      env: {
        ...process.env,
        PORT: String(webPort),
        VITE_API_BASE_URL: `${apiUrl}/api`,
      },
    },
  ],
});
