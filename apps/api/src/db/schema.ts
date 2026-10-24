import {
  boolean,
  integer,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const floorwalk = pgSchema('floorwalk');

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

export const sites = floorwalk.table('sites', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
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

export const templates = floorwalk.table('templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: createdAt(),
});

export const templateItems = floorwalk.table('template_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateId: uuid('template_id')
    .notNull()
    .references(() => templates.id),
  position: integer('position').notNull(),
  title: text('title').notNull(),
  photoRequired: boolean('photo_required').notNull().default(false),
  critical: boolean('critical').notNull().default(false),
  createdAt: createdAt(),
});

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
