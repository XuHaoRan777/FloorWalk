import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'mobile-home.spec.ts',
  use: { baseURL: 'http://127.0.0.1:3112' },
  webServer: {
    command: 'pnpm --filter @apps/mobile exec expo start --web --port 3112',
    url: 'http://127.0.0.1:3112',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
