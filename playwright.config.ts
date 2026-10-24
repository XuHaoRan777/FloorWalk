import { defineConfig } from '@playwright/test';
import { apiPort, slot } from './tests/e2e/slot.js';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  outputDir: `./tests/e2e-results/slot-${slot}`,
  reporter: [['line']],
  use: {
    baseURL: `http://127.0.0.1:${apiPort}`,
    trace: 'retain-on-failure',
  },
});
