import { defineConfig } from '@playwright/test';
import { apiPort } from './tests/e2e/slot.js';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  outputDir: `./tests/e2e-results/slot-${process.env.FW_SLOT ?? '1'}`,
  reporter: [['line']],
  use: {
    baseURL: `http://127.0.0.1:${apiPort}`,
    trace: 'retain-on-failure',
  },
});
