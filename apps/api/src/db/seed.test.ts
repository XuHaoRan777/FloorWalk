import { access } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from './client.js';
import { runMigrations } from './migrate.js';
import { seedDatabase } from './seed.js';

describe('Northbean seed', () => {
  let pool: Pool;
  let northbeanOrgId: string;
  let secondOrgId: string;

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    pool = createPool();
    const organizations = await pool.query<{ id: string; name: string }>(
      'SELECT id, name FROM floorwalk.organizations ORDER BY name',
    );
    expect(organizations.rows.map((row) => row.name).sort()).toEqual(
      ['Northbean', '演示二号'].sort(),
    );
    northbeanOrgId = organizations.rows.find(
      (row) => row.name === 'Northbean',
    )!.id;
    secondOrgId = organizations.rows.find((row) => row.name === '演示二号')!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('creates all sites with managers and one administrator', async () => {
    const result = await pool.query<{
      sites: string;
      users: string;
      managers: string;
      admins: string;
      templates: string;
      template_items: string;
    }>(
      `SELECT
      (SELECT COUNT(*) FROM floorwalk.sites WHERE org_id = $1) AS sites,
      (SELECT COUNT(*) FROM floorwalk.users WHERE org_id = $1) AS users,
      (SELECT COUNT(*) FROM floorwalk.users WHERE org_id = $1 AND role = 'store_manager') AS managers,
      (SELECT COUNT(*) FROM floorwalk.users WHERE org_id = $1 AND role = 'admin') AS admins,
      (SELECT COUNT(*) FROM floorwalk.templates WHERE org_id = $1) AS templates,
      (SELECT COUNT(*) FROM floorwalk.template_items ti
       JOIN floorwalk.templates t ON t.id = ti.template_id WHERE t.org_id = $1) AS template_items`,
      [northbeanOrgId],
    );
    expect(result.rows[0]).toEqual({
      sites: '12',
      users: '14',
      managers: '13',
      admins: '1',
      templates: '1',
      template_items: '8',
    });
    const siteInspectors = await pool.query<{ site_id: string; count: string }>(
      `SELECT site_id, COUNT(*)::text AS count FROM floorwalk.users
       WHERE org_id = $1 AND role = 'store_manager' GROUP BY site_id ORDER BY site_id`,
      [northbeanOrgId],
    );
    expect(siteInspectors.rows).toHaveLength(12);
    expect(siteInspectors.rows.filter((row) => row.count === '2')).toHaveLength(
      1,
    );
    expect(siteInspectors.rows.every((row) => Number(row.count) >= 1)).toBe(
      true,
    );
    const admin = await pool.query<{ role: string }>(
      'SELECT role FROM floorwalk.users WHERE org_id = $1 AND login_name = $2',
      [northbeanOrgId, 'hq@northbean.example'],
    );
    expect(admin.rows).toEqual([{ role: 'admin' }]);
  });

  it('has a manager login shared by both organizations', async () => {
    const result = await pool.query<{ org_id: string }>(
      `SELECT org_id FROM floorwalk.users WHERE role = 'store_manager'
       AND login_name = 'inspector@northbean.example'`,
    );
    expect(result.rows.map((row) => row.org_id).sort()).toEqual(
      [northbeanOrgId, secondOrgId].sort(),
    );
  });

  it('creates a separate second organization with its own judged inspection', async () => {
    const users = await pool.query<{
      role: string;
      site_org_id: string | null;
    }>(
      `SELECT u.role, s.org_id AS site_org_id FROM floorwalk.users u
       LEFT JOIN floorwalk.sites s ON s.id = u.site_id
       WHERE u.org_id = $1 ORDER BY u.role`,
      [secondOrgId],
    );
    expect(users.rows).toEqual([
      { role: 'admin', site_org_id: null },
      { role: 'store_manager', site_org_id: secondOrgId },
    ]);
    const templates = await pool.query<{ ai_enabled: boolean; items: string }>(
      `SELECT t.ai_enabled, COUNT(ti.id)::text AS items FROM floorwalk.templates t
       LEFT JOIN floorwalk.template_items ti ON ti.template_id = t.id
       WHERE t.org_id = $1 GROUP BY t.id`,
      [secondOrgId],
    );
    expect(templates.rows).toEqual([{ ai_enabled: false, items: '8' }]);
    const inspections = await pool.query<{
      status: string;
      score: number;
      template_org_id: string;
      inspector_org_id: string;
      decision_org_count: string;
      decisions_same_org: boolean;
      decisions: string;
    }>(
      `SELECT i.status, i.score, t.org_id AS template_org_id,
         u.org_id AS inspector_org_id,
         COUNT(DISTINCT actor.org_id)::text AS decision_org_count,
         bool_and(actor.org_id = $1) AS decisions_same_org,
         COUNT(decision.id)::text AS decisions
       FROM floorwalk.inspections i
       JOIN floorwalk.sites s ON s.id = i.site_id
       JOIN floorwalk.templates t ON t.id = i.template_id
       JOIN floorwalk.users u ON u.id = i.inspector_id
       JOIN floorwalk.inspection_items item ON item.inspection_id = i.id
       JOIN floorwalk.inspection_item_decisions decision
         ON decision.inspection_item_id = item.id
       JOIN floorwalk.users actor ON actor.id = decision.actor_id
       WHERE s.org_id = $1
       GROUP BY i.status, i.score, t.org_id, u.org_id`,
      [secondOrgId],
    );
    expect(inspections.rows).toEqual([
      {
        status: 'passed',
        score: 100,
        template_org_id: secondOrgId,
        inspector_org_id: secondOrgId,
        decision_org_count: '1',
        decisions_same_org: true,
        decisions: '8',
      },
    ]);
  });

  it('keeps the required status distribution and distinct timestamps', async () => {
    const judged = await pool.query<{ code: string; count: string }>(
      `SELECT code, COUNT(*)::text AS count FROM (
         SELECT s.code, i.status, ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY i.created_at) AS row_number
         FROM floorwalk.inspections i JOIN floorwalk.sites s ON s.id = i.site_id
         WHERE s.org_id = $1 AND i.status IN ('passed', 'failed')
       ) base WHERE row_number = 1 GROUP BY code ORDER BY code`,
      [northbeanOrgId],
    );
    expect(judged.rows).toHaveLength(12);
    expect(judged.rows.every((row) => row.count === '1')).toBe(true);

    const nb001 = await pool.query<{ status: string; score: number }>(
      `SELECT i.status, i.score FROM floorwalk.inspections i
       JOIN floorwalk.sites s ON s.id = i.site_id
       WHERE s.org_id = $1 AND s.code = 'NB-001'`,
      [northbeanOrgId],
    );
    expect(nb001.rows).toEqual([{ status: 'passed', score: 88 }]);

    const extraStatuses = await pool.query<{ status: string; count: string }>(
      `SELECT i.status, COUNT(*)::text AS count
       FROM floorwalk.inspections i JOIN floorwalk.sites s ON s.id = i.site_id
       WHERE s.org_id = $1 AND s.code <> 'NB-001' AND i.status IN ('failed', 'rework', 'submitted')
       GROUP BY i.status ORDER BY i.status`,
      [northbeanOrgId],
    );
    expect(extraStatuses.rows).toEqual([
      { status: 'failed', count: '3' },
      { status: 'rework', count: '2' },
    ]);
    const total = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM floorwalk.inspections i
       JOIN floorwalk.sites s ON s.id = i.site_id WHERE s.org_id = $1`,
      [northbeanOrgId],
    );
    expect(total.rows[0].count).toBe('18');

    const dashboard = await pool.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM (
         SELECT DISTINCT ON (site_id) site_id, i.status
         FROM floorwalk.inspections i JOIN floorwalk.sites s ON s.id = i.site_id
         WHERE s.org_id = $1 AND i.status IN ('passed', 'failed')
         ORDER BY site_id, i.decided_at DESC
       ) latest GROUP BY status ORDER BY status`,
      [northbeanOrgId],
    );
    expect(dashboard.rows).toEqual([
      { status: 'failed', count: '1' },
      { status: 'passed', count: '11' },
    ]);

    const timestamps = await pool.query<{
      inspections: string;
      created: string;
      submitted: string;
      decided: string;
      decided_non_null: string;
    }>(
      `SELECT COUNT(*)::text AS inspections,
      COUNT(DISTINCT i.created_at)::text AS created,
      COUNT(DISTINCT i.submitted_at)::text AS submitted,
      COUNT(DISTINCT i.decided_at)::text AS decided,
      COUNT(i.decided_at)::text AS decided_non_null
      FROM floorwalk.inspections i JOIN floorwalk.sites s ON s.id = i.site_id
      WHERE s.org_id = $1`,
      [northbeanOrgId],
    );
    expect(timestamps.rows[0].inspections).toBe(timestamps.rows[0].created);
    expect(timestamps.rows[0].submitted).toBe(timestamps.rows[0].created);
    expect(timestamps.rows[0].decided).toBe(
      timestamps.rows[0].decided_non_null,
    );
  });

  it('calculates each non-draft score from its passed inspection items', async () => {
    const scores = await pool.query<{
      score: number;
      calculated_score: number;
    }>(
      `SELECT i.score,
        ROUND(COUNT(*) FILTER (WHERE ii.result = 'pass') * 100.0 / COUNT(*))::int AS calculated_score
       FROM floorwalk.inspections i
       JOIN floorwalk.inspection_items ii ON ii.inspection_id = i.id
       WHERE i.status <> 'draft'
       GROUP BY i.id
       HAVING i.score IS DISTINCT FROM
         ROUND(COUNT(*) FILTER (WHERE ii.result = 'pass') * 100.0 / COUNT(*))::int`,
    );
    expect(scores.rows).toHaveLength(0);
  });

  it('links every seeded inspection to a task in the past seven days with first-judgment data', async () => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const firstDay = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
    const tasks = await pool.query<{
      inspections: string;
      tasks: string;
      minDate: string;
      maxDate: string;
      items: string;
      selfAssessments: string;
      firstResults: string;
      decisions: string;
    }>(
      `SELECT count(DISTINCT inspection.id)::text AS inspections,
         count(DISTINCT task.id)::text AS tasks,
         min(task.task_date)::text AS "minDate",
         max(task.task_date)::text AS "maxDate",
         count(item.id)::text AS items,
         count(item.id) FILTER (WHERE item.first_self_assessment IS NOT NULL)::text AS "selfAssessments",
         count(item.id) FILTER (WHERE item.first_result IS NOT NULL)::text AS "firstResults",
         count(decision.id)::text AS decisions
       FROM floorwalk.inspections inspection
       JOIN floorwalk.sites site ON site.id = inspection.site_id
       JOIN floorwalk.inspection_tasks task ON task.id = inspection.task_id
       JOIN floorwalk.inspection_items item ON item.inspection_id = inspection.id
       LEFT JOIN floorwalk.inspection_item_decisions decision
         ON decision.inspection_item_id = item.id
       WHERE site.org_id IN ($1, $2)`,
      [northbeanOrgId, secondOrgId],
    );
    expect(tasks.rows[0]).toMatchObject({
      inspections: '19',
      tasks: '19',
      minDate: firstDay.toISOString().slice(0, 10),
      maxDate: today.toISOString().slice(0, 10),
      items: '152',
      selfAssessments: '152',
      firstResults: '152',
      decisions: '152',
    });
  });

  it('satisfies photo and review invariants and writes seed files', async () => {
    const missingEvidence = await pool.query(
      `SELECT ii.id FROM floorwalk.inspection_items ii
       JOIN floorwalk.inspections i ON i.id = ii.inspection_id
       WHERE i.status <> 'draft' AND ii.min_photo_count > 0
       AND NOT EXISTS (
         SELECT 1 FROM floorwalk.evidence e WHERE e.inspection_item_id = ii.id
       )`,
    );
    expect(missingEvidence.rows).toHaveLength(0);

    const missingDecisions = await pool.query(
      `SELECT i.id FROM floorwalk.inspections i
       JOIN floorwalk.inspection_items item ON item.inspection_id = i.id
       WHERE item.uploaded_at IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM floorwalk.inspection_item_decisions decision
         WHERE decision.inspection_item_id = item.id
       )`,
    );
    expect(missingDecisions.rows).toHaveLength(0);

    const files = await pool.query<{ storage_key: string; org_id: string }>(
      `SELECT e.storage_key, s.org_id FROM floorwalk.evidence e
       JOIN floorwalk.inspection_items ii ON ii.id = e.inspection_item_id
       JOIN floorwalk.inspections i ON i.id = ii.inspection_id
       JOIN floorwalk.sites s ON s.id = i.site_id ORDER BY e.storage_key`,
    );
    const storageDir = path.resolve(
      process.env.STORAGE_DIR ?? path.join('apps', 'api', '.storage'),
    );
    expect(files.rows.length).toBeGreaterThan(0);
    for (const file of files.rows) {
      expect(file.storage_key).toMatch(
        new RegExp(`^org/${file.org_id}/seed/[^/]+/[^/]+\\.jpg$`),
      );
      await access(path.resolve(storageDir, file.storage_key));
    }

    const chat = await pool.query<{
      code: string;
      status: string;
      messages: string;
      text_messages: string;
      image_messages: string;
    }>(
      `SELECT s.code, i.status, COUNT(m.id)::text AS messages,
        COUNT(m.id) FILTER (WHERE m.body IS NOT NULL)::text AS text_messages,
        COUNT(m.id) FILTER (WHERE m.storage_key IS NOT NULL)::text AS image_messages
      FROM floorwalk.inspections i
      JOIN floorwalk.sites s ON s.id = i.site_id
      LEFT JOIN floorwalk.chat_messages m ON m.inspection_id = i.id
      WHERE s.org_id = $1 AND s.code = 'NB-002' AND i.status = 'rework'
      GROUP BY s.code, i.status`,
      [northbeanOrgId],
    );
    expect(chat.rows).toEqual([
      {
        code: 'NB-002',
        status: 'rework',
        messages: '2',
        text_messages: '1',
        image_messages: '1',
      },
    ]);
    const chatFiles = await pool.query<{ storage_key: string }>(
      'SELECT storage_key FROM floorwalk.chat_messages WHERE storage_key IS NOT NULL',
    );
    expect(chatFiles.rows).toHaveLength(1);
    expect(chatFiles.rows[0].storage_key).toMatch(
      new RegExp(`^org/${northbeanOrgId}/chat/[^/]+/[^/]+\\.jpg$`),
    );
    await access(path.resolve(storageDir, chatFiles.rows[0].storage_key));
  });
});
