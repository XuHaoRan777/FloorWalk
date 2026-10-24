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

  it('creates the contracted table seed counts and scores', async () => {
    const result = await pool.query<{
      sites: string;
      users: string;
      templates: string;
      template_items: string;
      inspections: string;
    }>(`SELECT
      (SELECT COUNT(*) FROM floorwalk.sites) AS sites,
      (SELECT COUNT(*) FROM floorwalk.users) AS users,
      (SELECT COUNT(*) FROM floorwalk.templates) AS templates,
      (SELECT COUNT(*) FROM floorwalk.template_items) AS template_items,
      (SELECT COUNT(*) FROM floorwalk.inspections) AS inspections`);
    expect(result.rows[0]).toEqual({
      sites: '12',
      users: '3',
      templates: '1',
      template_items: '8',
      inspections: '20',
    });

    const scoreResult = await pool.query<{ score: number; status: string }>(
      `SELECT i.score, i.status
       FROM floorwalk.inspections i
       JOIN floorwalk.sites s ON s.id = i.site_id
       WHERE s.code = 'NB-001' AND i.status = 'passed'`,
    );
    expect(scoreResult.rows).toEqual([{ score: 88, status: 'passed' }]);
  });
});
