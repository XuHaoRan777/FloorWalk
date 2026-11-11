import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  createdAt,
  floorwalk,
  sites,
  templates,
  users,
} from './base-schema.ts';

export const inspectionTasks = floorwalk.table(
  'inspection_tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').notNull(),
    siteId: uuid('site_id').notNull(),
    templateId: uuid('template_id').notNull(),
    taskDate: date('task_date', { mode: 'string' }).notNull(),
    position: integer('position').notNull(),
    occurrence: integer('occurrence').notNull().default(0),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('not_started'),
    createdAt: createdAt(),
  },
  (table) => [
    unique('inspection_tasks_org_site_date_window_occurrence_unique').on(
      table.orgId,
      table.siteId,
      table.taskDate,
      table.templateId,
      table.startsAt,
      table.dueAt,
      table.occurrence,
    ),
    foreignKey({
      name: 'inspection_tasks_org_site_fk',
      columns: [table.orgId, table.siteId],
      foreignColumns: [sites.orgId, sites.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'inspection_tasks_org_template_fk',
      columns: [table.orgId, table.templateId],
      foreignColumns: [templates.orgId, templates.id],
    }).onDelete('restrict'),
    index('inspection_tasks_status_due_idx').on(table.status, table.dueAt),
    check('inspection_tasks_position_check', sql`${table.position} >= 0`),
    check('inspection_tasks_occurrence_check', sql`${table.occurrence} >= 0`),
    check(
      'inspection_tasks_window_check',
      sql`${table.startsAt} < ${table.dueAt}`,
    ),
    check(
      'inspection_tasks_status_check',
      sql`${table.status} IN ('not_started', 'in_progress', 'submitted', 'overdue')`,
    ),
  ],
);

export const inspections = floorwalk.table(
  'inspections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    taskId: uuid('task_id').references(() => inspectionTasks.id),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id),
    templateId: uuid('template_id')
      .notNull()
      .references(() => templates.id),
    inspectorId: uuid('inspector_id').references(() => users.id),
    status: text('status').notNull().default('draft'),
    score: integer('score'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('inspections_task_id_unique')
      .on(table.taskId)
      .where(sql`${table.taskId} IS NOT NULL`),
  ],
);

export const inspectionItems = floorwalk.table(
  'inspection_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    inspectionId: uuid('inspection_id')
      .notNull()
      .references(() => inspections.id),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    minPhotoCount: integer('min_photo_count').notNull().default(0),
    acceptanceCriteria: text('acceptance_criteria').notNull().default(''),
    critical: boolean('critical').notNull(),
    result: text('result').notNull().default('pending'),
    selfAssessment: text('self_assessment'),
    firstSelfAssessment: text('first_self_assessment'),
    firstResult: text('first_result'),
    uploadedById: uuid('uploaded_by_id').references(() => users.id),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
    incomplete: boolean('incomplete').notNull().default(false),
    note: text('note'),
    createdAt: createdAt(),
  },
  (table) => [
    check(
      'inspection_items_min_photo_count_check',
      sql`${table.minPhotoCount} BETWEEN 0 AND 10`,
    ),
    check(
      'inspection_items_acceptance_criteria_length_check',
      sql`char_length(${table.acceptanceCriteria}) <= 500`,
    ),
    check(
      'inspection_items_result_check',
      sql`${table.result} IN ('pending', 'pass', 'rework', 'fail')`,
    ),
    check(
      'inspection_items_self_assessment_check',
      sql`${table.selfAssessment} IS NULL OR ${table.selfAssessment} IN ('pass', 'fail')`,
    ),
    check(
      'inspection_items_first_self_assessment_check',
      sql`${table.firstSelfAssessment} IS NULL OR ${table.firstSelfAssessment} IN ('pass', 'fail')`,
    ),
    check(
      'inspection_items_first_result_check',
      sql`${table.firstResult} IS NULL OR ${table.firstResult} IN ('pass', 'rework', 'fail')`,
    ),
    check(
      'inspection_items_upload_metadata_check',
      sql`(${table.uploadedById} IS NULL AND ${table.uploadedAt} IS NULL)
        OR (${table.uploadedById} IS NOT NULL AND ${table.uploadedAt} IS NOT NULL)`,
    ),
  ],
);

export const inspectionItemDecisions = floorwalk.table(
  'inspection_item_decisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    inspectionItemId: uuid('inspection_item_id')
      .notNull()
      .references(() => inspectionItems.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    previousResult: text('previous_result'),
    newResult: text('new_result').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('inspection_item_decisions_item_created_idx').on(
      table.inspectionItemId,
      table.createdAt,
    ),
    check(
      'inspection_item_decisions_previous_result_check',
      sql`${table.previousResult} IS NULL OR ${table.previousResult} IN ('pass', 'rework', 'fail')`,
    ),
    check(
      'inspection_item_decisions_new_result_check',
      sql`${table.newResult} IN ('pass', 'rework', 'fail')`,
    ),
  ],
);

export const inspectionParticipants = floorwalk.table(
  'inspection_participants',
  {
    inspectionId: uuid('inspection_id')
      .notNull()
      .references(() => inspections.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
  },
  (table) => [primaryKey({ columns: [table.inspectionId, table.userId] })],
);

export const evidence = floorwalk.table('evidence', {
  id: uuid('id').defaultRandom().primaryKey(),
  inspectionItemId: uuid('inspection_item_id')
    .notNull()
    .references(() => inspectionItems.id),
  storageKey: text('storage_key').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  createdAt: createdAt(),
});

export const reviews = floorwalk.table('reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  inspectionId: uuid('inspection_id')
    .notNull()
    .references(() => inspections.id),
  reviewerId: uuid('reviewer_id')
    .notNull()
    .references(() => users.id),
  action: text('action').notNull(),
  comment: text('comment'),
  reworkItemIds: uuid('rework_item_ids').array(),
  createdAt: createdAt(),
});

export const chatMessages = floorwalk.table(
  'chat_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    seq: bigserial('seq', { mode: 'bigint' }).notNull().unique(),
    inspectionId: uuid('inspection_id')
      .notNull()
      .references(() => inspections.id),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    body: text('body'),
    storageKey: text('storage_key'),
    mime: text('mime'),
    size: integer('size'),
    createdAt: createdAt(),
  },
  (table) => [
    index('chat_messages_inspection_seq_idx').on(table.inspectionId, table.seq),
    check(
      'chat_messages_body_or_image_check',
      sql`${table.body} IS NOT NULL OR ${table.storageKey} IS NOT NULL`,
    ),
    check(
      'chat_messages_body_length_check',
      sql`${table.body} IS NULL OR char_length(${table.body}) <= 1000`,
    ),
    check(
      'chat_messages_image_fields_check',
      sql`(${table.storageKey} IS NULL AND ${table.mime} IS NULL AND ${table.size} IS NULL)
        OR (${table.storageKey} IS NOT NULL AND ${table.mime} IS NOT NULL AND ${table.size} IS NOT NULL)`,
    ),
  ],
);
