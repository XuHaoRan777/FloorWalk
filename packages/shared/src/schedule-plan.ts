import type { ScheduleDefinition, ScheduleTask } from './contract/schedules.js';

export type SchedulePlanSite = {
  active: boolean;
  timezone: string;
  schedule: ScheduleDefinition | null;
  skippedRanges: { startsOn: string; endsOn: string }[];
};

export type PlannedScheduleTask = {
  templateId: string;
  startsAt: string;
  endsAt: string;
};

const dayMilliseconds = 24 * 60 * 60 * 1000;

/** date is a calendar date (YYYY-MM-DD) in the organization's timezone. */
export function planFor(
  site: SchedulePlanSite,
  date: string,
): PlannedScheduleTask[] {
  const calendar = new Date(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(calendar.getTime()) ||
    calendar.toISOString().slice(0, 10) !== date
  ) {
    throw new RangeError('日程日期必须是有效的 YYYY-MM-DD。');
  }
  if (
    !site.active ||
    !site.schedule ||
    site.skippedRanges.some(
      (range) => range.startsOn <= date && date <= range.endsOn,
    )
  ) {
    return [];
  }
  const weekday = calendar.getUTCDay() || 7;
  const day = site.schedule.days.find((entry) => entry.weekday === weekday);
  if (!day?.enabled) return [];

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: site.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const nextDate = new Date(calendar.getTime() + dayMilliseconds)
    .toISOString()
    .slice(0, 10);
  return day.tasks.map((task: ScheduleTask) => ({
    templateId: task.templateId,
    startsAt: absoluteTime(date, task.startsAt, formatter),
    endsAt: absoluteTime(
      task.endsAt <= task.startsAt ? nextDate : date,
      task.endsAt,
      formatter,
    ),
  }));
}

function absoluteTime(
  date: string,
  time: string,
  formatter: Intl.DateTimeFormat,
): string {
  const local = Date.parse(`${date}T${time}:00.000Z`);
  const offsets = new Set(
    [-dayMilliseconds, 0, dayMilliseconds].map((delta) => {
      const instant = local + delta;
      return localTimestamp(instant, formatter) - instant;
    }),
  );
  const candidates = [...offsets].map((offset) => local - offset);
  const matches = candidates.filter(
    (candidate) => localTimestamp(candidate, formatter) === local,
  );
  // Use the earlier instant in an overlap, or advance through a clock gap.
  const instant = matches.length
    ? Math.min(...matches)
    : Math.max(...candidates);
  return new Date(instant).toISOString();
}

function localTimestamp(
  instant: number,
  formatter: Intl.DateTimeFormat,
): number {
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return Date.parse(
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000Z`,
  );
}
