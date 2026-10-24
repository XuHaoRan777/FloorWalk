import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export default async function globalSetup() {
  const envFile =
    process.env.FLOORWALK_ENV_FILE ?? path.resolve('apps/api/.env.development');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  const slot = Number(process.env.FW_SLOT);
  const apiPort = 3100 + slot * 10;
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  databaseUrl.pathname = `/floorwalk_e2e_${slot}`;
  const env = {
    ...process.env,
    FW_SLOT: String(slot),
    PORT: String(apiPort),
    HOST: '127.0.0.1',
    DATABASE_URL: databaseUrl.toString(),
    STORAGE_DIR: path.resolve(`apps/api/.e2e/slot-${slot}/storage`),
  };
  execSync('pnpm --filter @apps/api db:migrate', {
    env,
    stdio: 'inherit',
    shell: true,
  });
  execSync('pnpm --filter @apps/api db:seed', {
    env,
    stdio: 'inherit',
    shell: true,
  });
}
