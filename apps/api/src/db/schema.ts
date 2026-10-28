import { sql } from 'drizzle-orm';
import {
  boolean,
  bigserial,
  check,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const floorwalk = pgSchema('floorwalk');

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

export const sites = floorwalk.table('sites', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const users = floorwalk.table('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull(),
  siteId: uuid('site_id').references(() => sites.id),
  createdAt: createdAt(),
});

export const sessions = floorwalk.table(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

export const templates = floorwalk.table(
  'templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(),
    isCurrent: boolean('is_current').notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('templates_single_current_idx')
      .on(table.isCurrent)
      .where(sql`${table.isCurrent} = true`),
  ],
);

export const templateItems = floorwalk.table(
  'template_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => templates.id),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    photoRequired: boolean('photo_required').notNull().default(false),
    critical: boolean('critical').notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    unique('template_items_template_position_unique').on(
      table.templateId,
      table.position,
    ),
  ],
);

export const inspections = floorwalk.table('inspections', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id')
    .notNull()
    .references(() => sites.id),
  templateId: uuid('template_id')
    .notNull()
    .references(() => templates.id),
  inspectorId: uuid('inspector_id')
    .notNull()
    .references(() => users.id),
  status: text('status').notNull().default('draft'),
  score: integer('score'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const inspectionItems = floorwalk.table('inspection_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  inspectionId: uuid('inspection_id')
    .notNull()
    .references(() => inspections.id),
  position: integer('position').notNull(),
  title: text('title').notNull(),
  photoRequired: boolean('photo_required').notNull(),
  critical: boolean('critical').notNull(),
  result: text('result').notNull().default('pending'),
  note: text('note'),
  createdAt: createdAt(),
});

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
