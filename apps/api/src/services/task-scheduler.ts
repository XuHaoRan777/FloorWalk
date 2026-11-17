import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  planFor,
  scheduleDefinitionSchema,
  type ScheduleDefinition,
} from '@libs/shared';
import type { Pool, PoolClient } from 'pg';
import { DATABASE_POOL } from '../db/pool.provider.js';
import { TaskDecisionService } from './task-decisions.js';
import { expireDueTasks as expireAndNotifyDueTasks } from './notifications.js';

type Queryable = Pick<Pool, 'query'>;

export type TaskSchedulerClock = { now: () => Date };
export const TASK_SCHEDULER_CLOCK = 'TASK_SCHEDULER_CLOCK';

type ScheduleTaskRow = {
  name: string;
  weekday: number;
  enabled: boolean;
  templateId: string | null;
  startsAt: string | null;
  endsAt: string | null;
};

type ExistingTaskRow = {
  id: string;
  templateId: string;
  position: number;
  occurrence: number;
  startsAt: Date;
  dueAt: Date;
  status: string;
  hasInspection: boolean;
};

type DesiredTask = {
  templateId: string;
  position: number;
  occurrence: number;
  startsAt: string;
  dueAt: string;
  signature: string;
  existingId?: string;
};

@Injectable()
export class TaskSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskSchedulerService.name);
  private timer: NodeJS.Timeout | undefined;
  private ticking = false;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(TASK_SCHEDULER_CLOCK)
    private readonly clock: TaskSchedulerClock,
    @Inject(TaskDecisionService)
    private readonly decisions: TaskDecisionService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runDailySync(), 60_000);
    this.timer.unref();
    void this.runDailySync();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async syncOrganizationToday(orgId: string, now?: Date) {
    const sites = await this.pool.query<{ id: string; timezone: string }>(
      `SELECT site.id, org.timezone
       FROM floorwalk.sites site
       JOIN floorwalk.organizations org ON org.id = site.org_id
       WHERE site.org_id = $1
       ORDER BY site.id`,
      [orgId],
    );
    await this.syncByTimezone(sites.rows, now ?? this.clock.now());
  }

  async syncSitesToday(siteIds: readonly string[], now?: Date) {
    if (!siteIds.length) return;
    const sites = await this.pool.query<{ id: string; timezone: string }>(
      `SELECT site.id, org.timezone
       FROM floorwalk.sites site
       JOIN floorwalk.organizations org ON org.id = site.org_id
       WHERE site.id = ANY($1::uuid[])
       ORDER BY site.id`,
      [[...new Set(siteIds)]],
    );
    await this.syncByTimezone(sites.rows, now ?? this.clock.now());
  }

  async expireDueTasks(now = this.clock.now()) {
    await expireAndNotifyDueTasks(this.pool, now);
  }

  async syncSiteDate(siteId: string, taskDate: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const site = await client.query<{
        orgId: string;
        active: boolean;
        timezone: string;
      }>(
        `SELECT site.org_id AS "orgId", site.deactivated_at IS NULL AS active,
           org.timezone
         FROM floorwalk.sites site
         JOIN floorwalk.organizations org ON org.id = site.org_id
         WHERE site.id = $1
         FOR UPDATE OF site`,
        [siteId],
      );
      if (!site.rows[0]) {
        await client.query('COMMIT');
        return;
      }

      const schedule = await this.readSchedule(
        client,
        site.rows[0].orgId,
        siteId,
      );
      const skippedRanges = await client.query<{
        startsOn: string;
        endsOn: string;
      }>(
        `SELECT starts_on::text AS "startsOn", ends_on::text AS "endsOn"
         FROM floorwalk.site_schedule_skips
         WHERE org_id = $1 AND site_id = $2`,
        [site.rows[0].orgId, siteId],
      );
      const planned = planFor(
        {
          active: site.rows[0].active,
          timezone: site.rows[0].timezone,
          schedule,
          skippedRanges: skippedRanges.rows,
        },
        taskDate,
      );
      const existing = await client.query<ExistingTaskRow>(
        `SELECT task.id, task.template_id AS "templateId",
           task.position, task.occurrence, task.starts_at AS "startsAt",
           task.due_at AS "dueAt", task.status,
           EXISTS (SELECT 1 FROM floorwalk.inspections inspection
             WHERE inspection.task_id = task.id) AS "hasInspection"
         FROM floorwalk.inspection_tasks task
         WHERE task.org_id = $1 AND task.site_id = $2 AND task.task_date = $3::date
         ORDER BY task.position, task.occurrence
         FOR UPDATE OF task`,
        [site.rows[0].orgId, siteId, taskDate],
      );

      await this.reconcile(client, {
        orgId: site.rows[0].orgId,
        siteId,
        taskDate,
        planned,
        existing: existing.rows,
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(
        '同步门店当天任务失败。',
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    } finally {
      client.release();
    }
  }

  private async syncByTimezone(
    sites: readonly { id: string; timezone: string }[],
    now: Date,
  ) {
    for (const site of sites)
      await this.syncSiteDate(site.id, localDate(now, site.timezone));
  }

  private async runDailySync() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const now = this.clock.now();
      await this.expireDueTasks(now);
      await this.decisions.processDueTasks(now);
      const sites = await this.pool.query<{ id: string; timezone: string }>(
        `SELECT site.id, org.timezone
         FROM floorwalk.sites site
         JOIN floorwalk.organizations org ON org.id = site.org_id
         ORDER BY site.id`,
      );
      await this.syncByTimezone(sites.rows, now);
    } catch (error) {
      this.logger.error(
        '每日任务同步失败。',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.ticking = false;
    }
  }

  private async readSchedule(
    database: Queryable,
    orgId: string,
    siteId: string,
  ): Promise<ScheduleDefinition | null> {
    const rows = await database.query<ScheduleTaskRow>(
      `SELECT schedule.name, day.weekday, day.enabled,
         task.template_id AS "templateId",
         left(task.starts_at::text, 5) AS "startsAt",
         left(task.ends_at::text, 5) AS "endsAt"
       FROM floorwalk.site_schedules assignment
       JOIN floorwalk.schedules schedule
         ON schedule.org_id = assignment.org_id AND schedule.id = assignment.schedule_id
       JOIN floorwalk.schedule_days day
         ON day.org_id = schedule.org_id AND day.schedule_id = schedule.id
       LEFT JOIN floorwalk.schedule_tasks task
         ON task.org_id = day.org_id AND task.schedule_id = day.schedule_id
         AND task.weekday = day.weekday
       WHERE assignment.org_id = $1 AND assignment.site_id = $2
       ORDER BY day.weekday, task.position`,
      [orgId, siteId],
    );
    if (!rows.rowCount) return null;

    const days = new Map<
      number,
      {
        weekday: number;
        enabled: boolean;
        tasks: NonNullable<ScheduleDefinition['days'][number]['tasks']>;
      }
    >();
    for (const row of rows.rows) {
      let day = days.get(row.weekday);
      if (!day) {
        day = { weekday: row.weekday, enabled: row.enabled, tasks: [] };
        days.set(row.weekday, day);
      }
      if (row.templateId && row.startsAt && row.endsAt)
        day.tasks.push({
          templateId: row.templateId,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
        });
    }
    return scheduleDefinitionSchema.parse({
      name: rows.rows[0].name,
      days: [...days.values()],
    });
  }

  private async reconcile(
    client: PoolClient,
    input: {
      orgId: string;
      siteId: string;
      taskDate: string;
      planned: { templateId: string; startsAt: string; endsAt: string }[];
      existing: ExistingTaskRow[];
    },
  ) {
    const started = input.existing.filter(
      (task) => task.status !== 'not_started' || task.hasInspection,
    );
    const pending = input.existing.filter(
      (task) => task.status === 'not_started' && !task.hasInspection,
    );
    const startedCounts = new Map<string, number>();
    const startedOccurrences = new Map<string, Set<number>>();
    for (const task of started) {
      const key = taskSignature(
        task.templateId,
        task.startsAt.toISOString(),
        task.dueAt.toISOString(),
      );
      startedCounts.set(key, (startedCounts.get(key) ?? 0) + 1);
      const occurrences = startedOccurrences.get(key) ?? new Set<number>();
      occurrences.add(task.occurrence);
      startedOccurrences.set(key, occurrences);
    }

    const remaining: {
      templateId: string;
      position: number;
      startsAt: string;
      dueAt: string;
      signature: string;
    }[] = [];
    for (const [position, task] of input.planned.entries()) {
      const signature = taskSignature(
        task.templateId,
        task.startsAt,
        task.endsAt,
      );
      const startedCount = startedCounts.get(signature) ?? 0;
      if (startedCount) {
        startedCounts.set(signature, startedCount - 1);
        continue;
      }
      remaining.push({
        templateId: task.templateId,
        position,
        startsAt: task.startsAt,
        dueAt: task.endsAt,
        signature,
      });
    }

    const pendingBySignature = new Map<string, ExistingTaskRow[]>();
    for (const task of pending) {
      const key = taskSignature(
        task.templateId,
        task.startsAt.toISOString(),
        task.dueAt.toISOString(),
      );
      const values = pendingBySignature.get(key) ?? [];
      values.push(task);
      pendingBySignature.set(key, values);
    }

    const occurrenceSets = new Map(startedOccurrences);
    const desired: DesiredTask[] = [];
    for (const task of remaining) {
      const used = occurrenceSets.get(task.signature) ?? new Set<number>();
      const candidates = pendingBySignature.get(task.signature) ?? [];
      const existingIndex = candidates.findIndex(
        (candidate) => !used.has(candidate.occurrence),
      );
      const existingTask =
        existingIndex >= 0 ? candidates.splice(existingIndex, 1)[0] : undefined;
      let occurrence = existingTask?.occurrence;
      if (occurrence === undefined) {
        occurrence = 0;
        while (used.has(occurrence)) occurrence += 1;
      }
      used.add(occurrence);
      occurrenceSets.set(task.signature, used);
      desired.push({
        ...task,
        occurrence,
        ...(existingTask ? { existingId: existingTask.id } : {}),
      });
    }

    const retainedIds = desired.flatMap((task) =>
      task.existingId ? [task.existingId] : [],
    );
    const staleIds = pending
      .filter((task) => !retainedIds.includes(task.id))
      .map((task) => task.id);
    if (staleIds.length)
      await client.query(
        'DELETE FROM floorwalk.inspection_tasks WHERE id = ANY($1::uuid[])',
        [staleIds],
      );

    for (const task of desired) {
      if (task.existingId) {
        await client.query(
          `UPDATE floorwalk.inspection_tasks SET position = $2
           WHERE id = $1 AND position <> $2`,
          [task.existingId, task.position],
        );
        continue;
      }
      await client.query(
        `INSERT INTO floorwalk.inspection_tasks
           (org_id, site_id, template_id, task_date, position, occurrence,
            starts_at, due_at)
         VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8)`,
        [
          input.orgId,
          input.siteId,
          task.templateId,
          input.taskDate,
          task.position,
          task.occurrence,
          task.startsAt,
          task.dueAt,
        ],
      );
    }
  }
}

function taskSignature(templateId: string, startsAt: string, dueAt: string) {
  return `${templateId}|${startsAt}|${dueAt}`;
}

function localDate(now: Date, timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
