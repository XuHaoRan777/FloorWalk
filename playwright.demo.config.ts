import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const envFile =
  process.env.FLOORWALK_ENV_FILE ?? path.resolve('apps/api/.env.development');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const configuredSlot = process.env.FW_SLOT;
if (!configuredSlot) throw new Error('FW_SLOT 未设置；请设置为 1、2 或 3。');
const slot = Number(configuredSlot);
if (!Number.isInteger(slot) || slot < 1 || slot > 3)
  throw new Error('FW_SLOT 必须是 1、2 或 3。');

const apiPort = 3100 + slot * 10;
const webPort = apiPort + 1;
const metroPort = apiPort + 2;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const mobileUrl = `http://127.0.0.1:${metroPort}`;
const projectRoot = process.cwd();
const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
databaseUrl.pathname = `/floorwalk_e2e_${slot}`;

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

const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  ),
);
const apiEnv = {
  ...inheritedEnv,
  FW_SLOT: String(slot),
  PORT: String(apiPort),
  HOST: '127.0.0.1',
  DATABASE_URL: databaseUrl.toString(),
  STORAGE_DIR: path.resolve(`apps/api/.e2e/slot-${slot}/storage`),
  API_PUBLIC_BASE_URL: `${apiUrl}`,
  NODE_ENV: 'development',
};

export default defineConfig({
  testDir: './tests/demo',
  testMatch: '*.spec.ts',
  globalSetup: './tests/mobile/global-setup.ts',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  outputDir: `./tests/web-results/demo-slot-${slot}`,
  reporter: [['line']],
  use: { baseURL: mobileUrl, trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'node scripts/e2e-api.mjs',
      cwd: projectRoot,
      env: apiEnv,
      url: `${apiUrl}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm --filter @apps/web dev -- --host 127.0.0.1 --port ${webPort}`,
      cwd: projectRoot,
      env: {
        ...inheritedEnv,
        PORT: String(webPort),
        VITE_API_BASE_URL: `${apiUrl}/api`,
      },
      url: webUrl,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm --filter @apps/mobile exec expo start --web --clear --max-workers 1 --port ${metroPort}`,
      cwd: projectRoot,
      env: {
        ...inheritedEnv,
        FW_SLOT: String(slot),
        EXPO_PUBLIC_API_BASE_URL: `${apiUrl}/api`,
        RCT_METRO_PORT: String(metroPort),
      },
      url: `${mobileUrl}/status`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
