import { access } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from './client.js';
import { runMigrations } from './migrate.js';
import { seedDatabase } from './seed.js';

describe('Northbean seed', () => {
  let pool: Pool;

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    pool = createPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('creates all sites, one inspector per site, and shared demo roles', async () => {
    const result = await pool.query<{
      sites: string;
      users: string;
      inspectors: string;
      templates: string;
      template_items: string;
    }>(`SELECT
      (SELECT COUNT(*) FROM floorwalk.sites) AS sites,
      (SELECT COUNT(*) FROM floorwalk.users) AS users,
      (SELECT COUNT(*) FROM floorwalk.users WHERE role = 'inspector') AS inspectors,
      (SELECT COUNT(*) FROM floorwalk.templates) AS templates,
      (SELECT COUNT(*) FROM floorwalk.template_items) AS template_items`);
    expect(result.rows[0]).toEqual({
      sites: '12',
      users: '14',
      inspectors: '12',
      templates: '1',
      template_items: '8',
    });
    const siteInspectors = await pool.query<{ site_id: string; count: string }>(
      `SELECT site_id, COUNT(*)::text AS count FROM floorwalk.users
       WHERE role = 'inspector' GROUP BY site_id ORDER BY site_id`,
    );
    expect(siteInspectors.rows).toHaveLength(12);
    expect(siteInspectors.rows.every((row) => row.count === '1')).toBe(true);
  });

  it('keeps the required status distribution and distinct timestamps', async () => {
    const judged = await pool.query<{ code: string; count: string }>(
      `SELECT code, COUNT(*)::text AS count FROM (
         SELECT s.code, i.status, ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY i.created_at) AS row_number
         FROM floorwalk.inspections i JOIN floorwalk.sites s ON s.id = i.site_id
         WHERE i.status IN ('passed', 'failed')
       ) base WHERE row_number = 1 GROUP BY code ORDER BY code`,
    );
    expect(judged.rows).toHaveLength(12);
    expect(judged.rows.every((row) => row.count === '1')).toBe(true);

    const nb001 = await pool.query<{ status: string; score: number }>(
      `SELECT i.status, i.score FROM floorwalk.inspections i
       JOIN floorwalk.sites s ON s.id = i.site_id
       WHERE s.code = 'NB-001'`,
    );
    expect(nb001.rows).toEqual([{ status: 'passed', score: 88 }]);

    const extraStatuses = await pool.query<{
      code: string;
      status: string;
      count: string;
    }>(
      `SELECT s.code, i.status, COUNT(*)::text AS count
       FROM floorwalk.inspections i JOIN floorwalk.sites s ON s.id = i.site_id
       WHERE s.code <> 'NB-001' AND i.status IN ('failed', 'rework', 'submitted')
       GROUP BY s.code, i.status ORDER BY s.code, i.status`,
    );
    expect(extraStatuses.rows).toHaveLength(33);
    expect(
      extraStatuses.rows.every((row) => ['2', '3'].includes(row.count)),
    ).toBe(true);

    const timestamps = await pool.query<{
      inspections: string;
      created: string;
      submitted: string;
      decided: string;
      decided_non_null: string;
    }>(`SELECT COUNT(*)::text AS inspections,
      COUNT(DISTINCT created_at)::text AS created,
      COUNT(DISTINCT submitted_at)::text AS submitted,
      COUNT(DISTINCT decided_at)::text AS decided,
      COUNT(decided_at)::text AS decided_non_null
      FROM floorwalk.inspections`);
    expect(timestamps.rows[0].inspections).toBe(timestamps.rows[0].created);
    expect(timestamps.rows[0].submitted).toBe(timestamps.rows[0].created);
    expect(timestamps.rows[0].decided).toBe(
      timestamps.rows[0].decided_non_null,
    );
  });

  it('satisfies photo and review invariants and writes seed files', async () => {
    const missingEvidence = await pool.query(
      `SELECT ii.id FROM floorwalk.inspection_items ii
       JOIN floorwalk.inspections i ON i.id = ii.inspection_id
       WHERE i.status <> 'draft' AND ii.photo_required
       AND NOT EXISTS (
         SELECT 1 FROM floorwalk.evidence e WHERE e.inspection_item_id = ii.id
       )`,
    );
    expect(missingEvidence.rows).toHaveLength(0);

    const missingReviews = await pool.query(
      `SELECT i.id FROM floorwalk.inspections i
       WHERE i.status IN ('passed', 'failed')
       AND NOT EXISTS (SELECT 1 FROM floorwalk.reviews r WHERE r.inspection_id = i.id)
       UNION ALL
       SELECT i.id FROM floorwalk.inspections i
       WHERE i.status = 'rework'
       AND NOT EXISTS (
         SELECT 1 FROM floorwalk.reviews r
         WHERE r.inspection_id = i.id AND r.action = 'rework'
           AND cardinality(r.rework_item_ids) > 0
       )`,
    );
    expect(missingReviews.rows).toHaveLength(0);

    const files = await pool.query<{ storage_key: string }>(
      'SELECT storage_key FROM floorwalk.evidence ORDER BY storage_key',
    );
    const storageDir = path.resolve(
      process.env.STORAGE_DIR ?? path.join('apps', 'api', '.storage'),
    );
    expect(files.rows.length).toBeGreaterThan(0);
    for (const file of files.rows)
      await access(path.resolve(storageDir, file.storage_key));
  });
});
