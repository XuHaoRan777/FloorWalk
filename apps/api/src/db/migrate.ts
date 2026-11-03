import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDatabase, createPool, getDatabaseUrl } from './client.js';
import { migrateLocalStorage } from './migrate-storage.js';

export async function runMigrations(
  databaseUrl = getDatabaseUrl(),
  storageDir = process.env.STORAGE_DIR ?? path.resolve('.storage'),
) {
  const pool = createPool(databaseUrl);
  try {
    await migrate(createDatabase(pool), {
      migrationsFolder: fileURLToPath(
        new URL('../../drizzle', import.meta.url),
      ),
    });
    await migrateLocalStorage(pool, storageDir);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMigrations().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
