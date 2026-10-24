import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from '../../apps/api/src/db/client.js';
import { runMigrations } from '../../apps/api/src/db/migrate.js';
import { seedDatabase } from '../../apps/api/src/db/seed.js';

const slotValue = Number(process.env.FW_SLOT ?? '1');
if (!Number.isInteger(slotValue) || slotValue < 1 || slotValue > 3) {
  throw new Error('FW_SLOT 必须是 1、2 或 3。');
}

export const slot = slotValue;
export const apiPort = 3100 + slot * 10;
export const webPort = apiPort + 1;
export const metroPort = apiPort + 2;
export const databaseName = `floorwalk_e2e_${slot}`;
export const storageDir = path.resolve(
  'apps',
  'api',
  '.e2e',
  `slot-${slot}`,
  'storage',
);

export function getBaseDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL 未配置。');
  }
  return databaseUrl;
}

export function getSlotDatabaseUrl() {
  const databaseUrl = new URL(getBaseDatabaseUrl());
  databaseUrl.pathname = `/${databaseName}`;
  return databaseUrl.toString();
}

export function getSlotEnvironment() {
  return {
    ...process.env,
    FW_SLOT: String(slot),
    PORT: String(apiPort),
    HOST: '127.0.0.1',
    DATABASE_URL: getSlotDatabaseUrl(),
    STORAGE_DIR: storageDir,
  };
}

export async function resetSlotResources() {
  const databaseUrl = getSlotDatabaseUrl();
  const pool = createPool(databaseUrl);
  try {
    await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
    await pool.query('DROP SCHEMA IF EXISTS floorwalk CASCADE');
  } finally {
    await pool.end();
  }
  await rm(storageDir, { recursive: true, force: true });
  await mkdir(storageDir, { recursive: true });
  await runMigrations(databaseUrl);
  await seedDatabase(databaseUrl, storageDir);
}

export function getSlotMarkerPath() {
  return path.join(storageDir, `slot-${slot}.marker`);
}

export const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
