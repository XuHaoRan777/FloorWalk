import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  primaryKey,
  text,
  time,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { floorwalk, organizations, sites, templates } from './schema.ts';

export const schedules = floorwalk.table(
  'schedules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
  },
  (table) => [
    unique('schedules_org_name_unique').on(table.orgId, table.name),
    unique('schedules_org_id_id_unique').on(table.orgId, table.id),
    check(
      'schedules_name_nonempty_check',
      sql`char_length(btrim(${table.name})) > 0`,
    ),
  ],
);

export const scheduleDays = floorwalk.table(
  'schedule_days',
  {
    orgId: uuid('org_id').notNull(),
    scheduleId: uuid('schedule_id').notNull(),
    weekday: integer('weekday').notNull(),
    enabled: boolean('enabled').notNull().default(true),
  },
  (table) => [
    primaryKey({
      name: 'schedule_days_pk',
      columns: [table.orgId, table.scheduleId, table.weekday],
    }),
    foreignKey({
      name: 'schedule_days_schedule_fk',
      columns: [table.orgId, table.scheduleId],
      foreignColumns: [schedules.orgId, schedules.id],
    }).onDelete('cascade'),
    check('schedule_days_weekday_check', sql`${table.weekday} BETWEEN 1 AND 7`),
  ],
);

export const scheduleTasks = floorwalk.table(
  'schedule_tasks',
  {
    orgId: uuid('org_id').notNull(),
    scheduleId: uuid('schedule_id').notNull(),
    weekday: integer('weekday').notNull(),
    position: integer('position').notNull(),
    templateId: uuid('template_id').notNull(),
    startsAt: time('starts_at', { precision: 0 }).notNull(),
    endsAt: time('ends_at', { precision: 0 }).notNull(),
  },
  (table) => [
    primaryKey({
      name: 'schedule_tasks_pk',
      columns: [table.orgId, table.scheduleId, table.weekday, table.position],
    }),
    foreignKey({
      name: 'schedule_tasks_day_fk',
      columns: [table.orgId, table.scheduleId, table.weekday],
      foreignColumns: [
        scheduleDays.orgId,
        scheduleDays.scheduleId,
        scheduleDays.weekday,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'schedule_tasks_template_fk',
      columns: [table.orgId, table.templateId],
      foreignColumns: [templates.orgId, templates.id],
    }).onDelete('restrict'),
    check('schedule_tasks_position_check', sql`${table.position} >= 0`),
  ],
);

export const siteSchedules = floorwalk.table(
  'site_schedules',
  {
    orgId: uuid('org_id').notNull(),
    siteId: uuid('site_id').notNull(),
    scheduleId: uuid('schedule_id').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'site_schedules_pk',
      columns: [table.orgId, table.siteId],
    }),
    foreignKey({
      name: 'site_schedules_site_fk',
      columns: [table.orgId, table.siteId],
      foreignColumns: [sites.orgId, sites.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'site_schedules_schedule_fk',
      columns: [table.orgId, table.scheduleId],
      foreignColumns: [schedules.orgId, schedules.id],
    }).onDelete('restrict'),
    index('site_schedules_schedule_idx').on(table.orgId, table.scheduleId),
  ],
);

export const siteScheduleSkips = floorwalk.table(
  'site_schedule_skips',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').notNull(),
    siteId: uuid('site_id').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    note: text('note'),
  },
  (table) => [
    foreignKey({
      name: 'site_schedule_skips_site_fk',
      columns: [table.orgId, table.siteId],
      foreignColumns: [sites.orgId, sites.id],
    }).onDelete('cascade'),
    index('site_schedule_skips_site_dates_idx').on(
      table.orgId,
      table.siteId,
      table.startsOn,
      table.endsOn,
    ),
    check(
      'site_schedule_skips_dates_check',
      sql`${table.startsOn} <= ${table.endsOn}`,
    ),
  ],
);
