import type { Pool } from 'pg';
import type {
  AdminTodayTask,
  DashboardMetrics,
  DashboardPeriod,
  DashboardPeriodResponse,
} from '@libs/shared';
import { iso } from './inspection-queries.js';

export async function loadDashboardTasks(
  pool: Pool,
  orgId: string,
  from: string,
  to: string,
  now: Date,
): Promise<AdminTodayTask[]> {
  const result = await pool.query(
    `SELECT task.id, task.site_id AS "siteId", task.template_id AS "templateId",
       task.task_date::text AS "taskDate", task.position,
       task.starts_at AS "startsAt", task.due_at AS "dueAt", task.created_at AS "createdAt",
       CASE WHEN uploads.complete THEN 'submitted'
         WHEN task.due_at <= $4 THEN 'overdue' ELSE task.status END AS status,
       site.code AS "siteCode", site.name AS "siteName",
       site.deactivated_at IS NULL AS "siteActive", site.created_at AS "siteCreatedAt",
       template.name AS "templateName",
       CASE WHEN inspection.decided_at IS NOT NULL
         AND inspection.status IN ('passed', 'failed') THEN inspection.score END AS score,
       COALESCE(uploads.critical_failure, false) AS "criticalFailure"
     FROM floorwalk.inspection_tasks task
     JOIN floorwalk.sites site ON site.id = task.site_id AND site.org_id = task.org_id
     JOIN floorwalk.templates template ON template.id = task.template_id AND template.org_id = task.org_id
     LEFT JOIN floorwalk.inspections inspection ON inspection.task_id = task.id
     LEFT JOIN LATERAL (
       -- A first upload is forbidden after the deadline. Reuploads replace uploaded_at,
       -- so presence of every upload, rather than its latest time, proves timely completion.
       SELECT count(*) > 0 AND bool_and(item.uploaded_at IS NOT NULL) AS complete,
         bool_or(item.critical AND item.result = 'fail') AS critical_failure
       FROM floorwalk.inspection_items item WHERE item.inspection_id = inspection.id
     ) uploads ON true
     WHERE task.org_id = $1 AND task.task_date BETWEEN $2::date AND $3::date
     ORDER BY task.task_date, site.code, task.starts_at, task.position, task.id`,
    [orgId, from, to, now],
  );
  return result.rows.map((row) => ({
    id: row.id,
    siteId: row.siteId,
    templateId: row.templateId,
    taskDate: row.taskDate,
    position: row.position,
    startsAt: iso(row.startsAt) as string,
    dueAt: iso(row.dueAt) as string,
    createdAt: iso(row.createdAt) as string,
    status: row.status,
    site: {
      id: row.siteId,
      code: row.siteCode,
      name: row.siteName,
      active: row.siteActive,
      createdAt: iso(row.siteCreatedAt) as string,
    },
    templateName: row.templateName,
    score: row.score,
    criticalFailure: row.criticalFailure,
  }));
}

export function dashboardRange(today: string, period: DashboardPeriod) {
  const start = new Date(`${today}T00:00:00Z`);
  const end = new Date(start);
  if (period === 'week') {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    end.setTime(start.getTime());
    end.setUTCDate(end.getUTCDate() + 6);
  } else {
    start.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
  }
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

function summarize(tasks: AdminTodayTask[]): DashboardMetrics {
  const completed = tasks.filter((task) => task.status === 'submitted').length;
  const scores = tasks.flatMap((task) =>
    task.score === null ? [] : [task.score],
  );
  return {
    expected: tasks.length,
    completed,
    completionRate: tasks.length ? completed / tasks.length : null,
    overdue: tasks.filter((task) => task.status === 'overdue').length,
    averageScore: scores.length
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : null,
  };
}

export async function loadPeriodDashboard(
  pool: Pool,
  orgId: string,
  period: DashboardPeriod,
  today: string,
  timezone: string,
  now: Date,
): Promise<DashboardPeriodResponse> {
  const { from, to } = dashboardRange(today, period);
  const tasks = await loadDashboardTasks(pool, orgId, from, to, now);
  const [sites, managers] = await Promise.all([
    pool.query(
      `SELECT id, code, name, deactivated_at IS NULL AS active, created_at AS "createdAt"
       FROM floorwalk.sites WHERE org_id = $1 ORDER BY code, id`,
      [orgId],
    ),
    pool.query<{
      id: string;
      displayName: string;
      submittedItems: number;
      passed: number;
      judged: number;
    }>(
      `SELECT uploader.id, uploader.display_name AS "displayName",
         count(*)::int AS "submittedItems",
         count(*) FILTER (WHERE item.result = 'pass')::int AS passed,
         count(*) FILTER (WHERE item.result IN ('pass', 'fail', 'rework'))::int AS judged
       FROM floorwalk.inspection_items item
       JOIN floorwalk.inspections inspection ON inspection.id = item.inspection_id
       JOIN floorwalk.inspection_tasks task ON task.id = inspection.task_id
       JOIN floorwalk.users uploader ON uploader.id = item.uploaded_by_id AND uploader.org_id = task.org_id
       WHERE task.org_id = $1 AND task.task_date BETWEEN $2::date AND $3::date
         AND item.uploaded_at IS NOT NULL AND uploader.role = 'store_manager'
       GROUP BY uploader.id
       ORDER BY "submittedItems" DESC, uploader.display_name, uploader.id`,
      [orgId, from, to],
    ),
  ]);
  const dates: DashboardPeriodResponse['dates'] = [];
  for (
    const day = new Date(`${from}T00:00:00Z`);
    day.toISOString().slice(0, 10) <= to;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    const date = day.toISOString().slice(0, 10);
    dates.push({
      date,
      metrics: summarize(tasks.filter((task) => task.taskDate === date)),
    });
  }
  return {
    period,
    from,
    to,
    timezone,
    overall: summarize(tasks),
    sites: sites.rows.map((site) => ({
      site: { ...site, createdAt: iso(site.createdAt) as string },
      metrics: summarize(tasks.filter((task) => task.siteId === site.id)),
    })),
    managers: managers.rows.map((manager) => ({
      id: manager.id,
      displayName: manager.displayName,
      submittedItems: manager.submittedItems,
      passRate: manager.judged ? manager.passed / manager.judged : null,
    })),
    dates,
  };
}
