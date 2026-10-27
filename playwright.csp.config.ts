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
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const noProxy = ['127.0.0.1', 'localhost'].join(',');
process.env.NO_PROXY = noProxy;
process.env.no_proxy = noProxy;

const apiEnvironment = {
  ...process.env,
  FW_SLOT: String(slot),
  PORT: String(apiPort),
  HOST: '127.0.0.1',
  DATABASE_URL: slotDatabaseUrl.toString(),
  STORAGE_DIR: `${projectRoot}/apps/api/.e2e/slot-${slot}/storage`,
  API_PUBLIC_BASE_URL: apiUrl,
  NODE_ENV: 'development',
  NO_PROXY: noProxy,
  no_proxy: noProxy,
};
const webEnvironment = {
  ...process.env,
  PORT: String(webPort),
  VITE_API_BASE_URL: `${apiUrl}/api`,
  NO_PROXY: noProxy,
  no_proxy: noProxy,
};

export default defineConfig({
  testDir: './tests/csp',
  testMatch: '**/*.spec.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: `./tests/web-results/csp-slot-${slot}`,
  reporter: [['line']],
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL: webUrl, trace: 'retain-on-failure' },
  webServer: [
    {
      command:
        'pnpm --filter @libs/shared build && pnpm --filter @apps/api dev',
      cwd: projectRoot,
      env: apiEnvironment,
      url: `${apiUrl}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm --filter @apps/web preview --host 127.0.0.1 --port ${webPort}`,
      cwd: projectRoot,
      env: webEnvironment,
      url: webUrl,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
