import { z, type ZodTypeAny } from 'zod';
import { aiReviewJobStatusSchema } from './ai.js';
import {
  selfCheckStatsQuerySchema,
  selfCheckStatsResponseSchema,
} from './stats.js';
import {
  siteSchema,
  loginNameSchema,
  organizationSummarySchema,
  timestamp,
  userRoleSchema,
  userRoles,
  userSchema,
  uuid,
  type UserRole,
} from './identity.js';
import { createOrgRequestSchema, createOrgResponseSchema } from './orgs.js';
import {
  requestEmailCodeRequestSchema,
  requestEmailCodeResponseSchema,
  verifyPasswordRecoveryCodeRequestSchema,
  verifyPasswordRecoveryCodeResponseSchema,
  resetPasswordRecoveryRequestSchema,
} from './email.js';
import {
  adminSiteSchema,
  adminUsersResponseSchema,
  changePasswordRequestSchema,
  createUserRequestSchema,
  resetUserPasswordRequestSchema,
  updateUserRequestSchema,
  userResponseSchema,
} from './users.js';
import {
  addScheduleSkipsRequestSchema,
  adminSchedulesResponseSchema,
  adminSiteSchedulesResponseSchema,
  assignScheduleRequestSchema,
  scheduleDefinitionSchema,
  scheduleResponseSchema,
} from './schedules.js';
import {
  inspectionItemDecisionResultSchema,
  inspectionItemDecisionResults,
  inspectionItemSelfAssessmentSchema,
  inspectionTaskStatusSchema,
  inspectionTaskSchema,
  inspectorTaskDetailSchema,
  inspectorTodayTaskSchema,
  taskItemUploadMetadataSchema,
} from './tasks.js';

export * from './identity.js';
export * from './orgs.js';
export * from './email.js';
export * from './users.js';
export * from './ai.js';
export * from './schedules.js';
export * from './tasks.js';
export * from './stats.js';

export const inspectionStatuses = [
  'draft',
  'submitted',
  'in_review',
  'passed',
  'rework',
  'failed',
] as const;
export const inspectionItemResults = [
  'pending',
  ...inspectionItemDecisionResults,
] as const;
export const errorCodes = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'INVALID_STATE',
  'INCOMPLETE',
  'CRITICAL_FAILED',
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'RATE_LIMITED',
] as const;

export const inspectionStatusSchema = z.enum(inspectionStatuses);
export const inspectionItemResultSchema = z.enum(inspectionItemResults);
export const errorCodeSchema = z.enum(errorCodes);

export const templateSchema = z.object({
  id: uuid,
  name: z.string().min(1),
  aiEnabled: z.boolean(),
  aiStandardId: uuid.nullable(),
  createdAt: timestamp,
});

export const templateItemSchema = z.object({
  id: uuid,
  templateId: uuid,
  position: z.number().int().positive(),
  title: z.string().min(1),
  minPhotoCount: z.number().int().min(0).max(10),
  acceptanceCriteria: z.string().max(500),
  critical: z.boolean(),
  createdAt: timestamp,
});

export const inspectionSchema = z.object({
  id: uuid,
  siteId: uuid,
  templateId: uuid,
  inspectorId: uuid.nullable(),
  status: inspectionStatusSchema,
  score: z.number().int().min(0).max(100).nullable(),
  submittedAt: timestamp.nullable(),
  decidedAt: timestamp.nullable(),
  createdAt: timestamp,
});

export const inspectionItemSchema = z.object({
  id: uuid,
  inspectionId: uuid,
  position: z.number().int().positive(),
  title: z.string().min(1),
  minPhotoCount: z.number().int().min(0).max(10),
  acceptanceCriteria: z.string().max(500),
  critical: z.boolean(),
  result: inspectionItemResultSchema,
  note: z.string().nullable(),
  createdAt: timestamp,
});

export const evidenceSchema = z.object({
  id: uuid,
  inspectionItemId: uuid,
  storageKey: z.string().min(1),
  mime: z.string().min(1),
  size: z.number().int().nonnegative(),
  createdAt: timestamp,
});

export const taskItemUploadResponseSchema = inspectionItemSchema.extend({
  selfAssessment: inspectionItemSelfAssessmentSchema,
  uploadedById: uuid,
  uploadedByName: z.string().min(1),
  uploadedAt: timestamp,
  evidence: z.array(evidenceSchema),
});

export const taskReviewItemSchema = inspectionItemSchema.extend({
  selfAssessment: inspectionItemSelfAssessmentSchema.nullable(),
  firstSelfAssessment: inspectionItemSelfAssessmentSchema.nullable(),
  firstResult: inspectionItemDecisionResultSchema.nullable(),
  uploadedById: uuid.nullable(),
  uploadedByName: z.string().nullable(),
  uploadedAt: timestamp.nullable(),
  incomplete: z.boolean(),
  aiReviewStatus: aiReviewJobStatusSchema.nullable(),
  aiReason: z.string().nullable(),
  evidence: z.array(evidenceSchema),
});

export const taskReviewSchema = inspectionTaskSchema.extend({
  inspectionId: uuid.nullable(),
  inspectionStatus: inspectionStatusSchema.nullable(),
  score: z.number().int().min(0).max(100).nullable(),
  submittedAt: timestamp.nullable(),
  decidedAt: timestamp.nullable(),
  site: siteSchema,
  templateName: z.string().min(1),
  items: z.array(taskReviewItemSchema),
});

export const taskReviewQueueResponseSchema = z.array(taskReviewSchema);
export const taskItemDecisionRequestSchema = z.object({
  result: inspectionItemDecisionResultSchema,
});

const reviewBaseSchema = z.object({
  id: uuid,
  inspectionId: uuid,
  reviewerId: uuid,
  comment: z.string().nullable(),
  createdAt: timestamp,
});

export const reviewSchema = z.discriminatedUnion('action', [
  reviewBaseSchema.extend({
    action: z.literal('start'),
    reworkItemIds: z.null(),
  }),
  reviewBaseSchema.extend({
    action: z.literal('approve'),
    reworkItemIds: z.null(),
  }),
  reviewBaseSchema.extend({
    action: z.literal('fail'),
    reworkItemIds: z.null(),
  }),
  reviewBaseSchema.extend({
    action: z.literal('rework'),
    reworkItemIds: z.array(uuid).min(1),
  }),
]);

export const loginRequestSchema = z.object({
  loginName: loginNameSchema,
  password: z.string().min(1),
  orgId: uuid.optional(),
});

export const loginResponseSchema = z.union([
  z.object({ user: userSchema }),
  z.object({ organizations: z.array(organizationSummarySchema).min(2) }),
]);

export const todayResponseSchema = z.object({
  site: siteSchema,
  timezone: z.string().min(1),
  tasks: z.array(inspectorTodayTaskSchema),
  templates: z.array(
    templateSchema.extend({
      items: z.array(templateItemSchema),
    }),
  ),
  submittedToday: z.boolean(),
  reworkInspections: z.array(inspectionSchema),
});

export const chatMessageSchema = z.object({
  id: uuid,
  seq: z.string().regex(/^[1-9]\d*$/),
  inspectionId: uuid,
  authorId: uuid,
  displayName: z.string().min(1),
  role: userRoleSchema,
  body: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
  createdAt: timestamp,
});

export const chatMessagesResponseSchema = z.object({
  messages: z.array(chatMessageSchema),
  hasMoreBefore: z.boolean(),
});

export const chatMessageRequestSchema = z
  .object({
    text: z.string().min(1).max(1000).optional(),
    file: z
      .object({
        mimetype: z.enum(['image/jpeg', 'image/png']),
        size: z
          .number()
          .int()
          .positive()
          .max(10 * 1024 * 1024),
      })
      .optional(),
  })
  .refine((value) => value.text !== undefined || value.file !== undefined);

export const chatImageUrlResponseSchema = z.object({
  url: z.string().url(),
  expiresAt: timestamp,
});

export const inspectorRecordSchema = z.object({
  id: uuid,
  taskDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  templateName: z.string().min(1),
  taskStatus: inspectionTaskStatusSchema.nullable(),
  status: inspectionStatusSchema,
  score: z.number().int().min(0).max(100).nullable(),
  createdAt: timestamp,
  submittedAt: timestamp.nullable(),
  decidedAt: timestamp.nullable(),
});

export const inspectorRecordsResponseSchema = z.object({
  items: z.array(inspectorRecordSchema),
  nextCursor: z.string().nullable(),
});

export const createSiteRequestSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
});

export const updateSiteRequestSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.active !== undefined);

export const adminSitesResponseSchema = z.array(adminSiteSchema);
export const siteResponseSchema = siteSchema;

export const adminTemplateSchema = templateSchema.extend({
  items: z.array(templateItemSchema),
});

const templateItemInputSchema = z.object({
  title: z.string().trim().min(1),
  minPhotoCount: z.number().int().min(0).max(10),
  acceptanceCriteria: z.string().max(500),
  critical: z.boolean(),
});

const templateInputSchema = z.object({
  name: z.string().trim().min(1),
  aiEnabled: z.boolean().default(true),
  aiStandardId: uuid.nullable().default(null),
});

function requireAiStandard(
  value: { aiEnabled: boolean; aiStandardId: string | null },
  context: z.RefinementCtx,
) {
  if (value.aiEnabled && value.aiStandardId === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['aiStandardId'],
      message: '启用 AI 时必须选择审核标准。',
    });
  }
}

export const createTemplateRequestSchema = templateInputSchema
  .extend({ items: z.array(templateItemInputSchema).min(1) })
  .superRefine(requireAiStandard);

export const updateTemplateRequestSchema = templateInputSchema
  .extend({
    items: z
      .array(
        templateItemInputSchema.extend({
          position: z.number().int().positive(),
        }),
      )
      .min(1),
  })
  .superRefine((value, context) => {
    requireAiStandard(value, context);
    if (value.items.some((item, index) => item.position !== index + 1)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message: '检查项位置必须从 1 开始连续排列。',
      });
    }
  });

export const adminTemplatesResponseSchema = z.array(adminTemplateSchema);
export const templateResponseSchema = adminTemplateSchema;

export const aiStandardSchema = z.object({
  id: uuid,
  name: z.string().min(1),
  prompt: z.string().min(1).max(4000),
  createdAt: timestamp,
});

export const createAiStandardRequestSchema = z.object({
  name: z.string().trim().min(1),
  prompt: z.string().min(1).max(4000),
});
export const updateAiStandardRequestSchema = createAiStandardRequestSchema;
export const adminAiStandardsResponseSchema = z.array(aiStandardSchema);
export const aiStandardResponseSchema = aiStandardSchema;

export const quickSetupTemplateRequestSchema = z.object({
  kind: z.enum(['coffee', 'restaurant', 'florist']),
});
export const quickSetupTemplateResponseSchema = z.object({
  template: adminTemplateSchema,
  standard: aiStandardSchema,
});

export const inspectionDetailSchema = inspectionSchema.extend({
  site: siteSchema,
  items: z.array(
    inspectionItemSchema.extend({
      evidence: z.array(evidenceSchema),
    }),
  ),
  reviews: z.array(reviewSchema),
});

export const signedEvidenceResponseSchema = z.object({
  url: z.string().url(),
  expiresAt: timestamp,
});

export const dashboardSiteScoreSchema = z.object({
  site: siteSchema,
  latestScore: z.number().int().min(0).max(100).nullable(),
  latestStatus: inspectionStatusSchema.nullable(),
});

export const dashboardSitesResponseSchema = z.array(dashboardSiteScoreSchema);

export const errorResponseSchema = z.object({
  code: errorCodeSchema,
  message: z.string().min(1),
});

export const evidenceUploadFieldName = 'file' as const;
export const evidenceMimeTypes = ['image/jpeg', 'image/png'] as const;
export const maxEvidenceSizeBytes = 10 * 1024 * 1024;
export const evidenceUploadRequestSchema = z.object({
  file: z.object({
    fieldName: z.literal(evidenceUploadFieldName),
    mimetype: z.enum(evidenceMimeTypes),
    size: z.number().int().nonnegative().max(maxEvidenceSizeBytes),
  }),
});

export const dashboardLatestStatuses = ['passed', 'failed'] as const;
export const databaseConstraints = {
  unique: [
    'email_verifications(email, purpose) WHERE consumed_at IS NULL',
    'sites(org_id, code)',
    'sites(org_id, id)',
    'templates(org_id, name)',
    'templates(org_id, id)',
    'users(org_id, login_name)',
    "users.org_id WHERE role = 'admin'",
    'inspection_participants(inspection_id, user_id)',
    'ai_review_standards(org_id, name)',
    'ai_review_standards(org_id, id)',
    'template_items(template_id, position)',
    'sessions.token_hash',
    'chat_messages.seq',
    'schedules(org_id, name)',
    'schedules(org_id, id)',
    'schedule_days(org_id, schedule_id, weekday)',
    'schedule_tasks(org_id, schedule_id, weekday, position)',
    'site_schedules(org_id, site_id)',
    'inspection_tasks(org_id, site_id, task_date, template_id, starts_at, due_at, occurrence)',
    'inspections(task_id) WHERE task_id IS NOT NULL',
  ],
  indexes: [
    'email_verifications(expires_at)',
    'sessions(user_id)',
    'inspections(site_id, status)',
    'inspections(created_at)',
    'evidence(inspection_item_id)',
    'chat_messages(inspection_id, seq)',
    'site_schedules(org_id, schedule_id)',
    'site_schedule_skips(org_id, site_id, starts_on, ends_on)',
    'inspection_tasks(status, due_at)',
    'inspection_item_decisions(inspection_item_id, created_at)',
  ],
  checks: [
    "email_verifications.purpose IN ('registration', 'password_recovery')",
    'email_verifications.attempt_count BETWEEN 0 AND 5',
    'email_verifications.code_hash IS NOT NULL OR purpose = password_recovery',
    "users.role IN ('admin', 'store_manager')",
    'users.role = store_manager requires site_id; admin requires NULL site_id',
    'ai_review_standards.name is not blank',
    'char_length(ai_review_standards.prompt) BETWEEN 1 AND 4000',
    'template_items.position > 0',
    'template_items.min_photo_count BETWEEN 0 AND 10',
    'char_length(template_items.acceptance_criteria) <= 500',
    "inspections.status IN ('draft', 'submitted', 'in_review', 'passed', 'rework', 'failed')",
    'inspections.score IS NULL OR inspections.score BETWEEN 0 AND 100',
    'inspection_items.position > 0',
    'inspection_items.min_photo_count BETWEEN 0 AND 10',
    'char_length(inspection_items.acceptance_criteria) <= 500',
    "inspection_items.result IN ('pending', 'pass', 'rework', 'fail')",
    "inspection_tasks.status IN ('not_started', 'in_progress', 'submitted', 'overdue')",
    'inspection_tasks.position >= 0',
    'inspection_tasks.occurrence >= 0',
    'inspection_tasks.starts_at < due_at',
    "inspection_items.self_assessment IS NULL OR self_assessment IN ('pass', 'fail')",
    "inspection_items.first_self_assessment IS NULL OR first_self_assessment IN ('pass', 'fail')",
    "inspection_items.first_result IS NULL OR first_result IN ('pass', 'rework', 'fail')",
    'inspection_items.uploaded_by_id and uploaded_at are both NULL or both NOT NULL',
    "inspection_item_decisions.previous_result IS NULL OR previous_result IN ('pass', 'rework', 'fail')",
    "inspection_item_decisions.new_result IN ('pass', 'rework', 'fail')",
    'evidence.size >= 0',
    "reviews.action IN ('start', 'approve', 'rework', 'fail')",
    'reviews.rework_item_ids is required only for rework reviews',
    'char_length(chat_messages.body) <= 1000',
    'chat_messages.body IS NOT NULL OR chat_messages.storage_key IS NOT NULL',
    'chat_messages.storage_key, mime, size are all NULL or all NOT NULL',
    'schedules.name is not blank',
    'schedule_days.weekday BETWEEN 1 AND 7',
    'schedule_tasks.position >= 0',
    'site_schedule_skips.starts_on <= ends_on',
  ],
} as const;

export const inspectionStatusTransitions = {
  draft: ['submitted'],
  submitted: ['in_review'],
  in_review: ['passed', 'rework', 'failed'],
  rework: ['submitted'],
  passed: [],
  failed: [],
} as const satisfies Record<
  (typeof inspectionStatuses)[number],
  readonly (typeof inspectionStatuses)[number][]
>;

export type ApiRouteRole = UserRole;
export type ApiRouteDefinition = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: `/api/${string}`;
  roles: readonly ApiRouteRole[];
  requestSchema: ZodTypeAny | null;
  responseSchema: ZodTypeAny;
  successStatus: 200 | 201 | 204;
  allowWhilePasswordChangeRequired?: boolean;
};

export const apiRoutes = {
  createSession: {
    method: 'POST',
    path: '/api/auth/session',
    roles: [],
    requestSchema: loginRequestSchema,
    responseSchema: loginResponseSchema,
    successStatus: 201,
  },
  deleteSession: {
    method: 'DELETE',
    path: '/api/auth/session',
    roles: [],
    requestSchema: null,
    responseSchema: z.undefined(),
    successStatus: 204,
    allowWhilePasswordChangeRequired: true,
  },
  requestRegistrationCode: {
    method: 'POST',
    path: '/api/auth/registration-code',
    roles: [],
    requestSchema: requestEmailCodeRequestSchema,
    responseSchema: requestEmailCodeResponseSchema,
    successStatus: 201,
  },
  requestPasswordRecoveryCode: {
    method: 'POST',
    path: '/api/auth/password-recovery-code',
    roles: [],
    requestSchema: requestEmailCodeRequestSchema,
    responseSchema: requestEmailCodeResponseSchema,
    successStatus: 201,
  },
  verifyPasswordRecoveryCode: {
    method: 'POST',
    path: '/api/auth/password-recovery/verify',
    roles: [],
    requestSchema: verifyPasswordRecoveryCodeRequestSchema,
    responseSchema: verifyPasswordRecoveryCodeResponseSchema,
    successStatus: 201,
  },
  resetPasswordRecovery: {
    method: 'POST',
    path: '/api/auth/password-recovery/reset',
    roles: [],
    requestSchema: resetPasswordRecoveryRequestSchema,
    responseSchema: z.undefined(),
    successStatus: 204,
  },
  me: {
    method: 'GET',
    path: '/api/me',
    roles: userRoles,
    requestSchema: null,
    responseSchema: userSchema,
    successStatus: 200,
    allowWhilePasswordChangeRequired: true,
  },
  createOrg: {
    method: 'POST',
    path: '/api/orgs',
    roles: [],
    requestSchema: createOrgRequestSchema,
    responseSchema: createOrgResponseSchema,
    successStatus: 201,
  },
  listAdminUsers: {
    method: 'GET',
    path: '/api/admin/users',
    roles: ['admin'],
    requestSchema: null,
    responseSchema: adminUsersResponseSchema,
    successStatus: 200,
  },
  createAdminUser: {
    method: 'POST',
    path: '/api/admin/users',
    roles: ['admin'],
    requestSchema: createUserRequestSchema,
    responseSchema: userResponseSchema,
    successStatus: 201,
  },
  updateAdminUser: {
    method: 'PATCH',
    path: '/api/admin/users/:id',
    roles: ['admin'],
    requestSchema: updateUserRequestSchema,
    responseSchema: userResponseSchema,
    successStatus: 200,
  },
  resetAdminUserPassword: {
    method: 'POST',
    path: '/api/admin/users/:id/password',
    roles: ['admin'],
    requestSchema: resetUserPasswordRequestSchema,
    responseSchema: z.undefined(),
    successStatus: 204,
  },
  changePassword: {
    method: 'POST',
    path: '/api/me/password',
    roles: userRoles,
    requestSchema: changePasswordRequestSchema,
    responseSchema: z.undefined(),
    successStatus: 204,
    allowWhilePasswordChangeRequired: true,
  },
  today: {
    method: 'GET',
    path: '/api/inspector/today',
    roles: ['store_manager'],
    requestSchema: null,
    responseSchema: todayResponseSchema,
    successStatus: 200,
  },
  getInspectorTask: {
    method: 'GET',
    path: '/api/inspector/tasks/:taskId',
    roles: ['store_manager'],
    requestSchema: null,
    responseSchema: inspectorTaskDetailSchema,
    successStatus: 200,
  },
  getInspection: {
    method: 'GET',
    path: '/api/inspections/:id',
    roles: userRoles,
    requestSchema: null,
    responseSchema: inspectionDetailSchema,
    successStatus: 200,
  },
  uploadTaskItem: {
    method: 'POST',
    path: '/api/tasks/:taskId/items/:position/uploads',
    roles: ['store_manager'],
    requestSchema: taskItemUploadMetadataSchema,
    responseSchema: taskItemUploadResponseSchema,
    successStatus: 201,
  },
  reviewTaskQueue: {
    method: 'GET',
    path: '/api/review/tasks',
    roles: ['admin'],
    requestSchema: null,
    responseSchema: taskReviewQueueResponseSchema,
    successStatus: 200,
  },
  getTaskReview: {
    method: 'GET',
    path: '/api/tasks/:taskId/review',
    roles: ['admin'],
    requestSchema: null,
    responseSchema: taskReviewSchema,
    successStatus: 200,
  },
  decideTaskItem: {
    method: 'POST',
    path: '/api/tasks/:taskId/items/:itemId/decision',
    roles: ['admin'],
    requestSchema: taskItemDecisionRequestSchema,
    responseSchema: taskReviewSchema,
    successStatus: 201,
  },
  getEvidence: {
    method: 'GET',
    path: '/api/evidence/:id',
    roles: userRoles,
    requestSchema: null,
    responseSchema: signedEvidenceResponseSchema,
    successStatus: 200,
  },
  dashboardSites: {
    method: 'GET',
    path: '/api/dashboard/sites',
    roles: ['admin'],
    requestSchema: null,
    responseSchema: dashboardSitesResponseSchema,
    successStatus: 200,
  },
  selfCheckStats: {
    method: 'GET',
    path: '/api/stats/self-check',
    roles: ['admin'],
    requestSchema: selfCheckStatsQuerySchema,
    responseSchema: selfCheckStatsResponseSchema,
    successStatus: 200,
  },
  listInspectionMessages: {
    method: 'GET',
    path: '/api/inspections/:id/messages',
    roles: userRoles,
    requestSchema: z
      .object({
        after: z
          .string()
          .regex(/^[1-9]\d*$/)
          .optional(),
        before: z
          .string()
          .regex(/^[1-9]\d*$/)
          .optional(),
        limit: z.coerce.number().int().positive().max(100).default(50),
      })
      .refine(
        (value) => value.after === undefined || value.before === undefined,
      ),
    responseSchema: chatMessagesResponseSchema,
    successStatus: 200,
  },
  createInspectionMessage: {
    method: 'POST',
    path: '/api/inspections/:id/messages',
    roles: ['store_manager'],
    requestSchema: chatMessageRequestSchema,
    responseSchema: chatMessageSchema,
    successStatus: 201,
  },
  getMessageImageUrl: {
    method: 'GET',
    path: '/api/messages/:id/image-url',
    roles: userRoles,
    requestSchema: null,
    responseSchema: chatImageUrlResponseSchema,
    successStatus: 200,
  },
  listInspectorInspections: {
    method: 'GET',
    path: '/api/inspector/inspections',
    roles: ['store_manager'],
    requestSchema: z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().positive().max(50).default(10),
    }),
    responseSchema: inspectorRecordsResponseSchema,
    successStatus: 200,
  },
  listAdminSites: {
    method: 'GET',
    path: '/api/admin/sites',
    roles: ['admin'],
    requestSchema: null,
    responseSchema: adminSitesResponseSchema,
    successStatus: 200,
  },
  listAdminSchedules: {
    method: 'GET',
    path: '/api/admin/schedules',
    roles: ['admin'],
    requestSchema: null,
    responseSchema: adminSchedulesResponseSchema,
    successStatus: 200,
  },
  createAdminSchedule: {
    method: 'POST',
    path: '/api/admin/schedules',
    roles: ['admin'],
    requestSchema: scheduleDefinitionSchema,
    responseSchema: scheduleResponseSchema,
    successStatus: 201,
  },
  updateAdminSchedule: {
    method: 'PUT',
    path: '/api/admin/schedules/:id',
    roles: ['admin'],
    requestSchema: scheduleDefinitionSchema,
    responseSchema: scheduleResponseSchema,
    successStatus: 200,
  },
  deleteAdminSchedule: {
    method: 'DELETE',
    path: '/api/admin/schedules/:id',
    roles: ['admin'],
    requestSchema: null,
    responseSchema: z.undefined(),
    successStatus: 204,
  },
  listAdminSiteSchedules: {
    method: 'GET',
    path: '/api/admin/site-schedules',
    roles: ['admin'],
    requestSchema: null,
    responseSchema: adminSiteSchedulesResponseSchema,
    successStatus: 200,
  },
  assignAdminSiteSchedule: {
    method: 'PUT',
    path: '/api/admin/site-schedules',
    roles: ['admin'],
    requestSchema: assignScheduleRequestSchema,
    responseSchema: adminSiteSchedulesResponseSchema,
    successStatus: 200,
  },
  addAdminSiteScheduleSkips: {
    method: 'POST',
    path: '/api/admin/site-schedules/skips',
    roles: ['admin'],
    requestSchema: addScheduleSkipsRequestSchema,
    responseSchema: adminSiteSchedulesResponseSchema,
    successStatus: 201,
  },
  deleteAdminSiteScheduleSkip: {
    method: 'DELETE',
    path: '/api/admin/site-schedules/skips/:id',
    roles: ['admin'],
    requestSchema: null,
    responseSchema: z.undefined(),
    successStatus: 204,
  },
  createAdminSite: {
    method: 'POST',
    path: '/api/admin/sites',
    roles: ['admin'],
    requestSchema: createSiteRequestSchema,
    responseSchema: siteResponseSchema,
    successStatus: 201,
  },
  updateAdminSite: {
    method: 'PATCH',
    path: '/api/admin/sites/:id',
    roles: ['admin'],
    requestSchema: updateSiteRequestSchema,
    responseSchema: siteResponseSchema,
    successStatus: 200,
  },
  listAdminTemplates: {
    method: 'GET',
    path: '/api/admin/templates',
    roles: ['admin'],
    requestSchema: null,
    responseSchema: adminTemplatesResponseSchema,
    successStatus: 200,
  },
  createAdminTemplate: {
    method: 'POST',
    path: '/api/admin/templates',
    roles: ['admin'],
    requestSchema: createTemplateRequestSchema,
    responseSchema: templateResponseSchema,
    successStatus: 201,
  },
  updateAdminTemplate: {
    method: 'PUT',
    path: '/api/admin/templates/:id',
    roles: ['admin'],
    requestSchema: updateTemplateRequestSchema,
    responseSchema: templateResponseSchema,
    successStatus: 200,
  },
  listAdminAiStandards: {
    method: 'GET',
    path: '/api/admin/ai-standards',
    roles: ['admin'],
    requestSchema: null,
    responseSchema: adminAiStandardsResponseSchema,
    successStatus: 200,
  },
  createAdminAiStandard: {
    method: 'POST',
    path: '/api/admin/ai-standards',
    roles: ['admin'],
    requestSchema: createAiStandardRequestSchema,
    responseSchema: aiStandardResponseSchema,
    successStatus: 201,
  },
  updateAdminAiStandard: {
    method: 'PUT',
    path: '/api/admin/ai-standards/:id',
    roles: ['admin'],
    requestSchema: updateAiStandardRequestSchema,
    responseSchema: aiStandardResponseSchema,
    successStatus: 200,
  },
  deleteAdminAiStandard: {
    method: 'DELETE',
    path: '/api/admin/ai-standards/:id',
    roles: ['admin'],
    requestSchema: null,
    responseSchema: z.undefined(),
    successStatus: 204,
  },
  quickSetupAdminTemplate: {
    method: 'POST',
    path: '/api/admin/templates/quick-setup',
    roles: ['admin'],
    requestSchema: quickSetupTemplateRequestSchema,
    responseSchema: quickSetupTemplateResponseSchema,
    successStatus: 201,
  },
} as const satisfies Record<string, ApiRouteDefinition>;

export type ApiRouteKey = keyof typeof apiRoutes;

export function apiRoutePath(route: ApiRouteDefinition) {
  return route.path.slice('/api'.length);
}

export type InspectionStatus = z.infer<typeof inspectionStatusSchema>;
export type InspectionItemResult = z.infer<typeof inspectionItemResultSchema>;
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type Template = z.infer<typeof templateSchema>;
export type TemplateItem = z.infer<typeof templateItemSchema>;
export type AiStandard = z.infer<typeof aiStandardSchema>;
export type AdminAiStandardsResponse = z.infer<
  typeof adminAiStandardsResponseSchema
>;
export type CreateAiStandardRequest = z.infer<
  typeof createAiStandardRequestSchema
>;
export type UpdateAiStandardRequest = z.infer<
  typeof updateAiStandardRequestSchema
>;
export type QuickSetupTemplateRequest = z.infer<
  typeof quickSetupTemplateRequestSchema
>;
export type QuickSetupTemplateResponse = z.infer<
  typeof quickSetupTemplateResponseSchema
>;
export type Inspection = z.infer<typeof inspectionSchema>;
export type InspectionItem = z.infer<typeof inspectionItemSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type TaskItemUploadResponse = z.infer<
  typeof taskItemUploadResponseSchema
>;
export type TaskReviewItem = z.infer<typeof taskReviewItemSchema>;
export type TaskReview = z.infer<typeof taskReviewSchema>;
export type TaskItemDecisionRequest = z.infer<
  typeof taskItemDecisionRequestSchema
>;
export type Review = z.infer<typeof reviewSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type TodayResponse = z.infer<typeof todayResponseSchema>;
export type InspectionDetail = z.infer<typeof inspectionDetailSchema>;
export type SignedEvidenceResponse = z.infer<
  typeof signedEvidenceResponseSchema
>;
export type DashboardSitesResponse = z.infer<
  typeof dashboardSitesResponseSchema
>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type EvidenceUploadRequest = z.infer<typeof evidenceUploadRequestSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatMessagesResponse = z.infer<typeof chatMessagesResponseSchema>;
export type InspectorRecordsResponse = z.infer<
  typeof inspectorRecordsResponseSchema
>;
export type AdminSitesResponse = z.infer<typeof adminSitesResponseSchema>;
export type AdminTemplatesResponse = z.infer<
  typeof adminTemplatesResponseSchema
>;

export type CalculateInspectionScore = (
  results: readonly InspectionItemResult[],
) => number;
export type ValidateInspectionSubmission = (input: {
  items: readonly InspectionItem[];
  evidenceCountByItemId: Readonly<Record<string, number>>;
}) => void;
export type CanReviewApprove = (items: readonly InspectionItem[]) => boolean;
export type GetLatestSiteScore = (
  inspections: readonly Inspection[],
) => Inspection | null;

export function calculateInspectionScore(
  results: readonly InspectionItemResult[],
) {
  if (results.length === 0) return 0;
  return Math.round(
    (results.filter((result) => result === 'pass').length / results.length) *
      100,
  );
}

export function validateInspectionSubmission(input: {
  items: readonly InspectionItem[];
  evidenceCountByItemId: Readonly<Record<string, number>>;
}) {
  if (input.items.some((item) => item.result === 'pending'))
    throw new Error('INCOMPLETE');
  if (
    input.items.some((item) =>
      item.minPhotoCount === 0
        ? !item.note?.trim()
        : (input.evidenceCountByItemId[item.id] ?? 0) < item.minPhotoCount,
    )
  )
    throw new Error('INCOMPLETE');
}

export function canReviewApprove(items: readonly InspectionItem[]) {
  return !items.some((item) => item.critical && item.result === 'fail');
}

export function getLatestSiteScore(inspections: readonly Inspection[]) {
  return (
    inspections
      .filter(
        (inspection) =>
          dashboardLatestStatuses.includes(
            inspection.status as (typeof dashboardLatestStatuses)[number],
          ) && inspection.decidedAt,
      )
      .sort((left, right) => {
        const leftTime = left.decidedAt ? Date.parse(left.decidedAt) : 0;
        const rightTime = right.decidedAt ? Date.parse(right.decidedAt) : 0;
        return rightTime - leftTime;
      })[0] ?? null
  );
}
