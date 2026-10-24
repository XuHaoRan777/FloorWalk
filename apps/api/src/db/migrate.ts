import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { createDatabase, createPool, getDatabaseUrl } from './client.js';

export async function runMigrations(databaseUrl = getDatabaseUrl()) {
  const pool = createPool(databaseUrl);
  try {
    await migrate(createDatabase(pool), {
      migrationsFolder: fileURLToPath(
        new URL('../../drizzle', import.meta.url),
      ),
    });
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
