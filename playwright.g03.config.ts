import { defineConfig } from '@playwright/test';
import { loadEnvFile } from 'node:process';
import path from 'node:path';

loadEnvFile('apps/api/.env.development');

const noProxy = [
  process.env.NO_PROXY,
  process.env.no_proxy,
  '127.0.0.1',
  'localhost',
]
  .filter(Boolean)
  .join(',');
process.env.NO_PROXY = noProxy;
process.env.no_proxy = noProxy;

const slotValue = Number(process.env.FW_SLOT ?? '1');
if (!Number.isInteger(slotValue) || slotValue < 1 || slotValue > 3)
  throw new Error('FW_SLOT 必须是 1、2 或 3。');

const slot = slotValue;
const apiPort = 3100 + slot * 10;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
databaseUrl.pathname = `/floorwalk_e2e_${slot}`;
const projectRoot = process.cwd();

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'g03.integration.spec.ts',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: `./tests/e2e-results/slot-${slot}`,
  reporter: [['line']],
  use: {
    baseURL: apiUrl,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/e2e-api.mjs',
    cwd: projectRoot,
    env: {
      ...process.env,
      FW_SLOT: String(slot),
      PORT: String(apiPort),
      HOST: '127.0.0.1',
      DATABASE_URL: databaseUrl.toString(),
      STORAGE_DIR: path.resolve(`apps/api/.e2e/slot-${slot}/storage`),
      API_PUBLIC_BASE_URL: apiUrl,
      NODE_ENV: 'development',
    },
    url: `${apiUrl}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
