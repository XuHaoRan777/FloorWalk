import { readMigrationFiles } from 'drizzle-orm/migrator';
import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { createPool, getDatabaseUrl } from './client.js';
import { runMigrations } from './migrate.js';
import { seedDatabase } from './seed.js';

const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const storageDir = process.env.STORAGE_DIR!;
const getSlotDatabaseUrl = () => {
  const url = getDatabaseUrl();
  if (!/^\/floorwalk_e2e_[123]$/.test(new URL(url).pathname) || !storageDir)
    throw new Error('迁移测试只能使用现有槽位库与槽位存储。');
  return url;
};

const migrations = readMigrationFiles({
  migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
});
const tables = [
  'sites',
  'users',
  'templates',
  'template_items',
  'inspections',
  'inspection_items',
  'evidence',
  'reviews',
  'sessions',
  'chat_messages',
] as const;
type Snapshot = {
  rows: Record<string, Record<string, unknown>[]>;
  files: Map<string, Buffer>;
};

async function snapshot(pool: Pool, root: string | null): Promise<Snapshot> {
  const rows: Snapshot['rows'] = {};
  for (const table of tables)
    rows[table] = (await pool.query(`SELECT * FROM floorwalk.${table}`)).rows;
  if (rows.sites[0]?.org_id) {
    const orgId = (
      await pool.query(
        "SELECT id FROM floorwalk.organizations WHERE name = 'Northbean' ORDER BY created_at LIMIT 1",
      )
    ).rows[0].id;
    for (const table of ['sites', 'users', 'templates'])
      rows[table] = rows[table].filter((r) => r.org_id === orgId);
    const has = (table: string, id: unknown) =>
      rows[table].some((r) => r.id === id);
    rows.template_items = rows.template_items.filter((r) =>
      has('templates', r.template_id),
    );
    rows.inspections = rows.inspections.filter((r) => has('sites', r.site_id));
    rows.inspection_items = rows.inspection_items.filter((r) =>
      has('inspections', r.inspection_id),
    );
    rows.evidence = rows.evidence.filter((r) =>
      has('inspection_items', r.inspection_item_id),
    );
    rows.reviews = rows.reviews.filter((r) =>
      has('inspections', r.inspection_id),
    );
    rows.sessions = rows.sessions.filter((r) => has('users', r.user_id));
    rows.chat_messages = rows.chat_messages.filter((r) =>
      has('inspections', r.inspection_id),
    );
  }
  const files = new Map<string, Buffer>();
  const keys = [...rows.evidence, ...rows.chat_messages].flatMap((r) =>
    typeof r.storage_key === 'string' ? [r.storage_key] : [],
  );
  let developmentFiles: Record<string, string> = {};
  if (root === null) {
    // Use the normal Node env-file loader, without reading or printing env values.
    // The child returns photo bytes over a pipe, never a configuration value.
    const env = { ...process.env };
    delete env.STORAGE_DIR;
    const result = spawnSync(
      process.execPath,
      [
        `--env-file=${path.join(projectRoot, 'apps/api/.env.development')}`,
        '--input-type=module',
        '-e',
        `import fs from 'node:fs'; import path from 'node:path';
       const keys = JSON.parse(fs.readFileSync(0, 'utf8'));
       const root = process.env.STORAGE_DIR ?? path.resolve('.storage');
       const files = {};
       for (const key of keys) files[key] = fs.readFileSync(path.resolve(root, key)).toString('base64');
       process.stdout.write(JSON.stringify(files));`,
      ],
      {
        env,
        cwd: path.join(projectRoot, 'apps/api'),
        input: JSON.stringify(keys),
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    if (result.status !== 0)
      throw new Error('开发库照片副本读取失败；源库和源文件未修改。');
    developmentFiles = JSON.parse(result.stdout);
  }
  for (const row of [...rows.evidence, ...rows.chat_messages]) {
    if (typeof row.storage_key === 'string') {
      const key = row.storage_key;
      const legacyKey = key.replace(/^org\/[0-9a-f-]+\//, '');
      files.set(
        legacyKey,
        root === null
          ? Buffer.from(developmentFiles[key], 'base64')
          : await readFile(path.resolve(root, key)),
      );
      row.storage_key = legacyKey;
    }
  }
  return { rows, files };
}

async function clearSlot(pool: Pool) {
  const identity = (
    await pool.query('SELECT current_user AS role, current_database() AS db')
  ).rows[0];
  expect(identity).toEqual({
    role: 'floorwalk',
    db: new URL(getSlotDatabaseUrl()).pathname.slice(1),
  });
  await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await pool.query('DROP SCHEMA IF EXISTS floorwalk CASCADE');
  await rm(storageDir, { recursive: true, force: true });
  await mkdir(storageDir, { recursive: true });
}

async function loadLegacy(pool: Pool, data: Snapshot) {
  for (const migration of migrations.slice(0, 3)) {
    for (const sql of migration.sql) await pool.query(sql);
  }
  await pool.query('CREATE SCHEMA drizzle');
  await pool.query(
    'CREATE TABLE drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)',
  );
  for (const migration of migrations.slice(0, 3))
    await pool.query(
      'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
      [migration.hash, migration.folderMillis],
    );
  for (const table of tables) {
    const columns = (
      await pool.query(
        'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position',
        ['floorwalk', table],
      )
    ).rows.map((row) => row.column_name as string);
    for (const row of data.rows[table]) {
      const values = columns.map((column) =>
        column === 'role' && row[column] === 'admin' ? 'hq' : row[column],
      );
      await pool.query(
        `INSERT INTO floorwalk.${table} (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
        values,
      );
    }
  }
  for (const [key, bytes] of data.files) {
    const target = path.resolve(storageDir, key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
}

async function counts(pool: Pool) {
  const result: Record<string, number> = {};
  for (const table of tables)
    result[table] = Number(
      (await pool.query(`SELECT count(*) FROM floorwalk.${table}`)).rows[0]
        .count,
    );
  return result;
}

describe('g03 forward migration (AC-01)', () => {
  it('migrates empty, development copy and existing slot data without losing rows or photos', async () => {
    const slotPool = createPool(getSlotDatabaseUrl());
    const devUrl = new URL(getSlotDatabaseUrl());
    devUrl.pathname = '/floorwalk';
    const development = createPool(devUrl.toString(), {
      options: '-c default_transaction_read_only=on',
    });
    try {
      expect(
        (await development.query('SELECT current_user AS role')).rows[0].role,
      ).toBe('floorwalk');
      const devCopy = await snapshot(development, null);
      const slotCopy = await snapshot(slotPool, storageDir);
      for (const [name, data] of [
        ['empty', null],
        ['development-copy', devCopy],
        ['slot', slotCopy],
      ] as const) {
        await clearSlot(slotPool);
        if (data) await loadLegacy(slotPool, data);
        const before = data
          ? await counts(slotPool)
          : Object.fromEntries(tables.map((t) => [t, 0]));
        await runMigrations(getSlotDatabaseUrl(), storageDir);
        expect(await counts(slotPool)).toEqual(before);
        const org = (
          await slotPool.query('SELECT id, name FROM floorwalk.organizations')
        ).rows;
        expect(org).toHaveLength(1);
        expect(org[0].name).toBe('Northbean');
        if (name === 'empty') {
          await slotPool.query('BEGIN');
          try {
            const secondOrg = (
              await slotPool.query(
                "INSERT INTO floorwalk.organizations (name) VALUES ('迁移断言二号') RETURNING id",
              )
            ).rows[0].id;
            await slotPool.query(
              'INSERT INTO floorwalk.templates (org_id, name, is_current) VALUES ($1, $2, true), ($3, $4, true)',
              [org[0].id, '迁移断言模板', secondOrg, '迁移断言模板'],
            );
            await expect(
              slotPool.query(
                'INSERT INTO floorwalk.templates (org_id, name, is_current) VALUES ($1, $2, true)',
                [org[0].id, '迁移断言模板二'],
              ),
            ).rejects.toMatchObject({ code: '23505' });
          } finally {
            await slotPool.query('ROLLBACK');
          }
        }
        for (const table of ['sites', 'users', 'templates']) {
          expect(
            (
              await slotPool.query(
                `SELECT count(*) FROM floorwalk.${table} WHERE org_id <> $1 OR org_id IS NULL`,
                [org[0].id],
              )
            ).rows[0].count,
          ).toBe('0');
        }
        expect(
          (
            await slotPool.query(
              "SELECT count(*) FROM floorwalk.users WHERE role = 'hq'",
            )
          ).rows[0].count,
        ).toBe('0');
        if (data) {
          const originalHq = data.rows.users
            .filter((r) => r.role === 'hq' || r.role === 'admin')
            .map((r) => r.id);
          expect(
            (
              await slotPool.query(
                "SELECT count(*) FROM floorwalk.users WHERE id = ANY($1::uuid[]) AND role = 'admin'",
                [originalHq],
              )
            ).rows[0].count,
          ).toBe(String(originalHq.length));
          for (const [key, bytes] of data.files) {
            const newKey = `org/${org[0].id}/${key}`;
            expect(await readFile(path.resolve(storageDir, newKey))).toEqual(
              bytes,
            );
            await expect(
              access(path.resolve(storageDir, key)),
            ).rejects.toMatchObject({ code: 'ENOENT' });
          }
          // Retry must preserve both the rows and their already migrated files.
          await runMigrations(getSlotDatabaseUrl(), storageDir);
          expect(await counts(slotPool)).toEqual(before);
        }
        console.info(
          'AC-01',
          name,
          JSON.stringify({ before, after: await counts(slotPool) }),
        );
      }
    } finally {
      await development.end();
      await clearSlot(slotPool);
      await runMigrations(getSlotDatabaseUrl(), storageDir);
      await seedDatabase(getSlotDatabaseUrl(), storageDir);
      await slotPool.end();
    }
  }, 60000);
});
