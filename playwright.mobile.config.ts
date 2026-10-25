import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const envFile =
  process.env.FLOORWALK_ENV_FILE ?? path.resolve('apps/api/.env.development');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

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

const configuredSlot = process.env.FW_SLOT;
if (!configuredSlot) {
  throw new Error('FW_SLOT 未设置；请设置为 1、2 或 3。');
}
const slot = Number(configuredSlot);
if (!Number.isInteger(slot) || slot < 1 || slot > 3) {
  throw new Error('FW_SLOT 必须是 1、2 或 3。');
}
const metroPort = 3100 + slot * 10 + 2;
const metroUrl = `http://127.0.0.1:${metroPort}`;
const apiPort = 3100 + slot * 10;
const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
databaseUrl.pathname = `/floorwalk_e2e_${slot}`;
const storageDir = path.resolve(`apps/api/.e2e/slot-${slot}/storage`);
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
  STORAGE_DIR: storageDir,
  API_PUBLIC_BASE_URL: `http://127.0.0.1:${apiPort}`,
};
const webEnv = {
  NODE_ENV: inheritedEnv.NODE_ENV ?? 'development',
  EXPO_PUBLIC_API_BASE_URL: `http://127.0.0.1:${apiPort}/api`,
  RCT_METRO_PORT: String(metroPort),
  NO_PROXY: inheritedEnv.NO_PROXY ?? '127.0.0.1,localhost',
  no_proxy: inheritedEnv.no_proxy ?? '127.0.0.1,localhost',
  PATH: inheritedEnv.PATH ?? inheritedEnv.Path ?? '',
  Path: inheritedEnv.Path ?? inheritedEnv.PATH ?? '',
  SystemRoot: inheritedEnv.SystemRoot ?? 'C:\\Windows',
};

export default defineConfig({
  testDir: './tests/mobile',
  testMatch: '*.spec.ts',
  globalSetup: './tests/mobile/global-setup.ts',
  timeout: 120_000,
  use: { baseURL: metroUrl },
  webServer: [
    {
      command: 'pnpm --filter @apps/api exec nest start',
      env: apiEnv,
      url: `http://127.0.0.1:${apiPort}/health`,
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: `pnpm --filter @apps/mobile exec expo start --web --clear --port ${metroPort}`,
      url: `${metroUrl}/status`,
      env: webEnv,
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
