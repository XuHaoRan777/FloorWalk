import { defineConfig } from '@playwright/test';
import path from 'node:path';

const configuredSlot = process.env.FW_SLOT;
if (!configuredSlot) {
  throw new Error('FW_SLOT 未设置；请设置为 1、2 或 3。');
}
const slot = Number(configuredSlot);
if (!Number.isInteger(slot) || slot < 1 || slot > 3) {
  throw new Error('FW_SLOT 必须是 1、2 或 3。');
}
const apiPort = 3100 + slot * 10;
const webPort = apiPort + 1;
const metroPort = apiPort + 2;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL 未配置。');
const slotDatabaseUrl = new URL(databaseUrl);
slotDatabaseUrl.pathname = `/floorwalk_e2e_${slot}`;
const slotEnvironment = {
  ...process.env,
  FW_SLOT: String(slot),
  PORT: String(apiPort),
  HOST: '127.0.0.1',
  DATABASE_URL: slotDatabaseUrl.toString(),
  STORAGE_DIR: path.resolve('apps', 'api', '.e2e', `slot-${slot}`, 'storage'),
  NODE_ENV: 'development',
};

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

export default defineConfig({
  globalSetup: './tests/e2e/global-setup.ts',
  testDir: './tests',
  testMatch: 'cors.spec.ts',
  workers: 1,
  outputDir: `./tests/web-results/cors-slot-${slot}`,
  webServer: [
    {
      command: 'node scripts/e2e-api.mjs',
      url: `http://127.0.0.1:${apiPort}/health`,
      env: slotEnvironment,
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: 'pnpm --filter @apps/web dev',
      url: `http://127.0.0.1:${webPort}/`,
      env: {
        ...process.env,
        PORT: String(webPort),
        VITE_API_BASE_URL: `http://127.0.0.1:${apiPort}/api`,
      },
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: `pnpm --filter @apps/mobile exec expo start --web --max-workers 1 --port ${metroPort}`,
      url: `http://127.0.0.1:${metroPort}/status`,
      env: {
        ...process.env,
        RCT_METRO_PORT: String(metroPort),
        EXPO_PUBLIC_API_BASE_URL: `http://127.0.0.1:${apiPort}/api`,
      },
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
  use: { trace: 'retain-on-failure' },
});
