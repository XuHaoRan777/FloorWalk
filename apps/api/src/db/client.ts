import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL 未配置。');
  }
  return databaseUrl;
}

export function createPool(
  databaseUrl = getDatabaseUrl(),
  options: Omit<PoolConfig, 'connectionString'> = {},
) {
  return new Pool({ connectionString: databaseUrl, ...options });
}

export function createDatabase(pool: Pool): Database {
  return drizzle(pool, { schema });
}
