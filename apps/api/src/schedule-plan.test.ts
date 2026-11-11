import { describe, expect, it } from 'vitest';
import {
  planFor,
  type ScheduleDefinition,
  type SchedulePlanSite,
} from '@libs/shared';

const templateId = '02700000-0000-4000-8000-000000000001';

function site(): SchedulePlanSite {
  const schedule: ScheduleDefinition = {
    name: '每周巡检',
    days: Array.from({ length: 7 }, (_, index) => ({
      weekday: index + 1,
      enabled: true,
      tasks: [{ templateId, startsAt: '23:30', endsAt: '01:15' }],
    })),
  };
  return {
    active: true,
    timezone: 'Asia/Shanghai',
    schedule,
    skippedRanges: [],
  };
}

describe('FW-027 planFor', () => {
  it('uses the start day for overnight tasks and keeps overlaps and repeated templates', () => {
    const target = site();
    target.schedule!.days[0].tasks.push(
      { templateId, startsAt: '23:59', endsAt: '00:00' },
      { templateId, startsAt: '08:00', endsAt: '08:00' },
    );
    target.schedule!.days[1].enabled = false;
    target.skippedRanges = [{ startsOn: '2026-11-10', endsOn: '2026-11-10' }];
    const original = structuredClone(target);
    expect(planFor(target, '2026-11-09')).toEqual([
      {
        templateId,
        startsAt: '2026-11-09T15:30:00.000Z',
        endsAt: '2026-11-09T17:15:00.000Z',
      },
      {
        templateId,
        startsAt: '2026-11-09T15:59:00.000Z',
        endsAt: '2026-11-09T16:00:00.000Z',
      },
      {
        templateId,
        startsAt: '2026-11-09T00:00:00.000Z',
        endsAt: '2026-11-10T00:00:00.000Z',
      },
    ]);
    expect(planFor(target, '2026-11-10')).toEqual([]);
    expect(target).toEqual(original);
  });

  it('includes both skip boundaries, single days and overlapping intervals', () => {
    const target = site();
    target.skippedRanges = [
      { startsOn: '2026-11-10', endsOn: '2026-11-12' },
      { startsOn: '2026-11-12', endsOn: '2026-11-13' },
      { startsOn: '2026-11-15', endsOn: '2026-11-15' },
    ];
    for (const date of [
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-15',
    ])
      expect(planFor(target, date)).toEqual([]);
    for (const date of ['2026-11-09', '2026-11-14', '2026-11-16'])
      expect(planFor(target, date)).toHaveLength(1);
  });

  it('returns no tasks for disabled sites, missing schedules and disabled weekdays', () => {
    const target = site();
    expect(planFor({ ...target, active: false }, '2026-11-09')).toEqual([]);
    expect(planFor({ ...target, schedule: null }, '2026-11-09')).toEqual([]);
    target.schedule!.days[0].enabled = false;
    expect(planFor(target, '2026-11-09')).toEqual([]);
    expect(planFor(target, '2026-11-08')).toHaveLength(1);
  });

  it('uses each organization timezone, including fractional offsets and clock changes', () => {
    const target = site();
    expect(planFor({ ...target, timezone: 'UTC' }, '2026-11-09')[0]).toEqual({
      templateId,
      startsAt: '2026-11-09T23:30:00.000Z',
      endsAt: '2026-11-10T01:15:00.000Z',
    });
    expect(
      planFor({ ...target, timezone: 'Asia/Kathmandu' }, '2026-11-09')[0],
    ).toEqual({
      templateId,
      startsAt: '2026-11-09T17:45:00.000Z',
      endsAt: '2026-11-09T19:30:00.000Z',
    });
    target.timezone = 'America/New_York';
    target.schedule!.days[5].tasks = [
      { templateId, startsAt: '23:30', endsAt: '03:30' },
    ];
    expect(planFor(target, '2026-03-07')[0]).toEqual({
      templateId,
      startsAt: '2026-03-08T04:30:00.000Z',
      endsAt: '2026-03-08T07:30:00.000Z',
    });
    expect(planFor(target, '2026-10-31')[0]).toEqual({
      templateId,
      startsAt: '2026-11-01T03:30:00.000Z',
      endsAt: '2026-11-01T08:30:00.000Z',
    });
  });
});
