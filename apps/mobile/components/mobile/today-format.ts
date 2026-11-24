import type { InspectorTodayTask } from '@libs/shared';

export function formatLocalDate(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function formatLocalTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}

export function formatTimeWindow(task: InspectorTodayTask, timezone: string) {
  const starts = formatLocalTime(task.startsAt, timezone);
  const ends = formatLocalTime(task.dueAt, timezone);
  const crossesMidnight =
    formatLocalDate(task.startsAt, timezone) !==
    formatLocalDate(task.dueAt, timezone);
  return `${starts}～${crossesMidnight ? '次日 ' : ''}${ends}`;
}
