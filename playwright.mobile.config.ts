import { defineConfig } from '@playwright/test';

const noProxy = [process.env.NO_PROXY, process.env.no_proxy, '127.0.0.1', 'localhost']
  .filter(Boolean)
  .join(',');
process.env.NO_PROXY = noProxy;
process.env.no_proxy = noProxy;

const slot = Number(process.env.FW_SLOT ?? '1');
if (!Number.isInteger(slot) || slot < 1 || slot > 3)
  throw new Error('FW_SLOT 必须是 1、2 或 3。');
const metroPort = 3100 + slot * 10 + 2;
const metroUrl = `http://127.0.0.1:${metroPort}`;

export default defineConfig({
  testDir: './tests',
  testMatch: 'mobile-home.spec.ts',
  timeout: 120_000,
  use: { baseURL: metroUrl },
  webServer: {
    command: `pnpm --filter @apps/mobile exec expo start --web --clear --port ${metroPort}`,
    url: `${metroUrl}/status`,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
