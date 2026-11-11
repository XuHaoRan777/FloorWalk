import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
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

export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

export const organizations = floorwalk.table('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('Asia/Shanghai'),
  createdAt: createdAt(),
});

export const sites = floorwalk.table(
  'sites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique('sites_org_code_unique').on(table.orgId, table.code),
    unique('sites_org_id_id_unique').on(table.orgId, table.id),
  ],
);

export const users = floorwalk.table(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    loginName: text('login_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    role: text('role').notNull(),
    siteId: uuid('site_id').references(() => sites.id),
    mustChangePassword: boolean('must_change_password')
      .notNull()
      .default(false),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    check('users_role_check', sql`${table.role} IN ('admin', 'store_manager')`),
    unique('users_org_login_name_unique').on(table.orgId, table.loginName),
    uniqueIndex('users_one_admin_per_org')
      .on(table.orgId)
      .where(sql`${table.role} = 'admin'`),
    check(
      'users_role_site_check',
      sql`(${table.role} = 'store_manager' AND ${table.siteId} IS NOT NULL) OR (${table.role} = 'admin' AND ${table.siteId} IS NULL)`,
    ),
  ],
);

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
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

export const emailVerifications = floorwalk.table(
  'email_verifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    purpose: text('purpose').notNull(),
    codeHash: text('code_hash'),
    attemptCount: integer('attempt_count').notNull().default(0),
    requestedAt: timestamp('requested_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    recoveryTokenHash: text('recovery_token_hash'),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [
    index('email_verifications_scope_requested_idx').on(
      table.email,
      table.purpose,
      table.requestedAt,
    ),
    index('email_verifications_expires_idx').on(table.expiresAt),
    uniqueIndex('email_verifications_active_unique')
      .on(table.email, table.purpose)
      .where(sql`${table.consumedAt} IS NULL`),
    check(
      'email_verifications_purpose_check',
      sql`${table.purpose} IN ('registration', 'password_recovery')`,
    ),
    check(
      'email_verifications_attempt_count_check',
      sql`${table.attemptCount} BETWEEN 0 AND 5`,
    ),
    check(
      'email_verifications_code_hash_check',
      sql`${table.codeHash} IS NOT NULL OR ${table.purpose} = 'password_recovery'`,
    ),
    check(
      'email_verifications_recovery_token_check',
      sql`${table.recoveryTokenHash} IS NULL OR (${table.verifiedAt} IS NOT NULL AND ${table.purpose} = 'password_recovery')`,
    ),
  ],
);

export const aiReviewStandards = floorwalk.table(
  'ai_review_standards',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    prompt: text('prompt').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique('ai_review_standards_org_name_unique').on(table.orgId, table.name),
    unique('ai_review_standards_org_id_id_unique').on(table.orgId, table.id),
    check(
      'ai_review_standards_name_nonempty_check',
      sql`char_length(btrim(${table.name})) > 0`,
    ),
    check(
      'ai_review_standards_prompt_length_check',
      sql`char_length(${table.prompt}) BETWEEN 1 AND 4000`,
    ),
  ],
);

export const templates = floorwalk.table(
  'templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    aiEnabled: boolean('ai_enabled').notNull().default(true),
    aiStandardId: uuid('ai_standard_id'),
    createdAt: createdAt(),
  },
  (table) => [
    unique('templates_org_name_unique').on(table.orgId, table.name),
    unique('templates_org_id_id_unique').on(table.orgId, table.id),
    foreignKey({
      name: 'templates_org_ai_standard_fk',
      columns: [table.orgId, table.aiStandardId],
      foreignColumns: [aiReviewStandards.orgId, aiReviewStandards.id],
    }).onDelete('restrict'),
    check(
      'templates_ai_standard_required_check',
      sql`${table.aiEnabled} = false OR ${table.aiStandardId} IS NOT NULL`,
    ),
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
    minPhotoCount: integer('min_photo_count').notNull().default(0),
    acceptanceCriteria: text('acceptance_criteria').notNull().default(''),
    critical: boolean('critical').notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    unique('template_items_template_position_unique').on(
      table.templateId,
      table.position,
    ),
    check(
      'template_items_min_photo_count_check',
      sql`${table.minPhotoCount} BETWEEN 0 AND 10`,
    ),
    check(
      'template_items_acceptance_criteria_length_check',
      sql`char_length(${table.acceptanceCriteria}) <= 500`,
    ),
  ],
);
