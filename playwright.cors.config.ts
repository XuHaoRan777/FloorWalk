import { defineConfig } from '@playwright/test';

const noProxy = [process.env.NO_PROXY, process.env.no_proxy, '127.0.0.1', 'localhost']
  .filter(Boolean)
  .join(',');
process.env.NO_PROXY = noProxy;
process.env.no_proxy = noProxy;

export default defineConfig({
  testDir: './tests',
  testMatch: 'cors.spec.ts',
  webServer: [
    {
      command: 'pnpm --filter @apps/api dev',
      url: 'http://127.0.0.1:3018/health',
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command: 'pnpm --filter @apps/web dev',
      url: 'http://127.0.0.1:3019/',
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command: 'pnpm --filter @apps/mobile exec expo start --web --port 3020',
      url: 'http://127.0.0.1:3020/status',
      reuseExistingServer: true,
      timeout: 120000,
    },
  ],
  use: { trace: 'retain-on-failure' },
});
