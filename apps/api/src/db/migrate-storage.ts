import { constants } from 'node:fs';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  realpath,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';

// Schema migrations commit first. This retryable phase keeps legacy keys valid
// until all destination files exist, then changes the keys in one transaction.
export async function migrateLocalStorage(pool: Pool, storageDir: string) {
  const root = path.resolve(storageDir);
  const client = await pool.connect();
  const copied: string[] = [];
  const oldFiles = new Set<string>();
  const resolveKey = async (key: string) => {
    const target = path.resolve(root, key);
    const relative = path.relative(root, target);
    if (!key || relative.startsWith('..') || path.isAbsolute(relative))
      throw new Error('迁移照片路径越界。');
    const actualRoot = await realpath(root).catch(() => root);
    let ancestor = target;
    while (true) {
      try {
        const actual = await realpath(ancestor);
        const actualRelative = path.relative(actualRoot, actual);
        if (actualRelative.startsWith('..') || path.isAbsolute(actualRelative))
          throw new Error('迁移照片路径越界。');
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        if (ancestor === root) break;
        ancestor = path.dirname(ancestor);
      }
    }
    return target;
  };
  try {
    await client.query('BEGIN');
    await client.query(
      'LOCK TABLE floorwalk.evidence, floorwalk.chat_messages IN SHARE ROW EXCLUSIVE MODE',
    );
    const records = await client.query<{
      source: 'evidence' | 'chat_messages';
      id: string;
      key: string;
      orgId: string;
    }>(`
      SELECT 'evidence' AS source, e.id, e.storage_key AS key, s.org_id AS "orgId"
      FROM floorwalk.evidence e JOIN floorwalk.inspection_items ii ON ii.id = e.inspection_item_id
      JOIN floorwalk.inspections i ON i.id = ii.inspection_id JOIN floorwalk.sites s ON s.id = i.site_id
      UNION ALL
      SELECT 'chat_messages', m.id, m.storage_key, s.org_id
      FROM floorwalk.chat_messages m JOIN floorwalk.inspections i ON i.id = m.inspection_id
      JOIN floorwalk.sites s ON s.id = i.site_id WHERE m.storage_key IS NOT NULL
    `);
    for (const row of records.rows) {
      const prefix = `org/${row.orgId}/`;
      const alreadyMigrated = row.key.startsWith(prefix);
      const legacyKey = alreadyMigrated
        ? row.key.slice(prefix.length)
        : row.key;
      const newKey = `${prefix}${legacyKey}`;
      const oldTarget = await resolveKey(legacyKey);
      const newTarget = await resolveKey(newKey);
      const legacyExists = await access(oldTarget).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
          return false;
        },
      );
      if (!alreadyMigrated || legacyExists) {
        await mkdir(path.dirname(newTarget), { recursive: true });
        try {
          await copyFile(oldTarget, newTarget, constants.COPYFILE_EXCL);
          copied.push(newTarget);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          const [oldBytes, newBytes] = await Promise.all([
            readFile(oldTarget),
            readFile(newTarget),
          ]);
          if (!oldBytes.equals(newBytes))
            throw new Error('迁移目标照片已存在且内容不同。', { cause: error });
        }
        // Table name comes only from the two literal SELECT branches above.
        if (!alreadyMigrated)
          await client.query(
            `UPDATE floorwalk.${row.source} SET storage_key = $1 WHERE id = $2`,
            [newKey, row.id],
          );
      }
      oldFiles.add(oldTarget);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    await Promise.all(copied.map((target) => unlink(target)));
    throw error;
  } finally {
    client.release();
  }
  // If cleanup is interrupted, rerunning also visits prefixed keys and retries it.
  for (const target of oldFiles) {
    await unlink(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
