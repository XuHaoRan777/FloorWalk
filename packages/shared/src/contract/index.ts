import { z, type ZodTypeAny } from 'zod';

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });

export const userRoles = ['inspector', 'supervisor', 'hq'] as const;
export const inspectionStatuses = [
  'draft',
  'submitted',
  'in_review',
  'passed',
  'rework',
  'failed',
] as const;
export const inspectionItemResults = ['pending', 'pass', 'fail'] as const;
export const reviewActions = ['start', 'approve', 'rework', 'fail'] as const;
export const errorCodes = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'INVALID_STATE',
  'INCOMPLETE',
  'CRITICAL_FAILED',
  'VALIDATION_FAILED',
  'NOT_FOUND',
] as const;

export const userRoleSchema = z.enum(userRoles);
export const inspectionStatusSchema = z.enum(inspectionStatuses);
export const inspectionItemResultSchema = z.enum(inspectionItemResults);
export const reviewActionSchema = z.enum(reviewActions);
export const errorCodeSchema = z.enum(errorCodes);

export const siteSchema = z.object({
  id: uuid,
  code: z.string().min(1),
  name: z.string().min(1),
  active: z.boolean(),
  createdAt: timestamp,
});

export const userSchema = z.object({
  id: uuid,
  email: z.string().email(),
  displayName: z.string().min(1),
  role: userRoleSchema,
  siteId: uuid.nullable(),
  createdAt: timestamp,
});

export const templateSchema = z.object({
  id: uuid,
  name: z.string().min(1),
  isCurrent: z.boolean(),
  createdAt: timestamp,
});

export const templateItemSchema = z.object({
  id: uuid,
  templateId: uuid,
  position: z.number().int().positive(),
  title: z.string().min(1),
  photoRequired: z.boolean(),
  critical: z.boolean(),
  createdAt: timestamp,
});

export const inspectionSchema = z.object({
  id: uuid,
  siteId: uuid,
  templateId: uuid,
  inspectorId: uuid,
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
  photoRequired: z.boolean(),
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
  email: z.string().email(),
  password: z.string().min(1),
});

export const loginResponseSchema = z.object({
  user: userSchema,
});

export const todayResponseSchema = z.object({
  site: siteSchema,
  template: templateSchema.extend({
    items: z.array(templateItemSchema),
  }),
  submittedToday: z.boolean(),
  reworkInspections: z.array(inspectionSchema),
});

export const chatMessageSchema = z.object({
  id: uuid,
  seq: z.number().int().positive(),
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
        size: z.number().int().positive().max(10 * 1024 * 1024),
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

export const adminSitesResponseSchema = z.array(siteSchema);
export const siteResponseSchema = siteSchema;

export const adminTemplateSchema = templateSchema.extend({
  items: z.array(templateItemSchema),
});

export const createTemplateRequestSchema = z.object({
  name: z.string().trim().min(1),
  items: z.array(
    z.object({
      title: z.string().trim().min(1),
      photoRequired: z.boolean(),
      critical: z.boolean(),
    }),
  ).min(1),
});

export const updateTemplateRequestSchema = z.object({
  name: z.string().trim().min(1),
  items: z.array(
    z.object({
      position: z.number().int().positive(),
      title: z.string().trim().min(1),
      photoRequired: z.boolean(),
      critical: z.boolean(),
    }),
  ).min(1),
});

export const adminTemplatesResponseSchema = z.array(adminTemplateSchema);
export const templateResponseSchema = adminTemplateSchema;

export const createInspectionRequestSchema = z.object({
  templateId: uuid,
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

export const updateInspectionItemRequestSchema = z.object({
  result: inspectionItemResultSchema,
  note: z.string().nullable().optional(),
});

export const signedEvidenceResponseSchema = z.object({
  url: z.string().url(),
  expiresAt: timestamp,
});

export const submitInspectionResponseSchema = inspectionSchema;

export const updateInspectionItemResponseSchema = inspectionItemSchema.extend({
  evidence: z.array(evidenceSchema),
});

export const reviewQueueResponseSchema = z.array(inspectionDetailSchema);

export const reviewRequestSchema = z
  .object({
    action: reviewActionSchema,
    comment: z.string().nullable().optional(),
    reworkItemIds: z.array(uuid).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.action === 'rework' &&
      (!value.reworkItemIds || value.reworkItemIds.length === 0)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reworkItemIds'],
        message: '打回时必须指定至少一个巡检项。',
      });
    }
    if (value.action !== 'rework' && value.reworkItemIds) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reworkItemIds'],
        message: '只有打回时可以指定巡检项。',
      });
    }
  });

export const reviewResponseSchema = inspectionDetailSchema;

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
    'templates.name',
    'templates.is_current WHERE is_current = true',
    'template_items(template_id, position)',
    'sessions.token_hash',
    'chat_messages.seq',
  ],
  indexes: [
    'sessions(user_id)',
    'inspections(site_id, status)',
    'inspections(created_at)',
    'evidence(inspection_item_id)',
    'chat_messages(inspection_id, seq)',
  ],
  checks: [
    "users.role IN ('inspector', 'supervisor', 'hq')",
    'users.role = inspector requires site_id; other roles require NULL site_id',
    'template_items.position > 0',
    "inspections.status IN ('draft', 'submitted', 'in_review', 'passed', 'rework', 'failed')",
    'inspections.score IS NULL OR inspections.score BETWEEN 0 AND 100',
    'inspection_items.position > 0',
    "inspection_items.result IN ('pending', 'pass', 'fail')",
    'evidence.size >= 0',
    "reviews.action IN ('start', 'approve', 'rework', 'fail')",
    'reviews.rework_item_ids is required only for rework reviews',
    'char_length(chat_messages.body) <= 1000',
    'chat_messages.body IS NOT NULL OR chat_messages.storage_key IS NOT NULL',
    'chat_messages.storage_key, mime, size are all NULL or all NOT NULL',
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
  },
  me: {
    method: 'GET',
    path: '/api/me',
    roles: userRoles,
    requestSchema: null,
    responseSchema: userSchema,
    successStatus: 200,
  },
  today: {
    method: 'GET',
    path: '/api/inspector/today',
    roles: ['inspector'],
    requestSchema: null,
    responseSchema: todayResponseSchema,
    successStatus: 200,
  },
  createInspection: {
    method: 'POST',
    path: '/api/inspections',
    roles: ['inspector'],
    requestSchema: createInspectionRequestSchema,
    responseSchema: inspectionSchema,
    successStatus: 201,
  },
  getInspection: {
    method: 'GET',
    path: '/api/inspections/:id',
    roles: userRoles,
    requestSchema: null,
    responseSchema: inspectionDetailSchema,
    successStatus: 200,
  },
  updateInspectionItem: {
    method: 'PATCH',
    path: '/api/inspections/:id/items/:itemId',
    roles: ['inspector'],
    requestSchema: updateInspectionItemRequestSchema,
    responseSchema: updateInspectionItemResponseSchema,
    successStatus: 200,
  },
  addEvidence: {
    method: 'POST',
    path: '/api/inspections/:id/items/:itemId/evidence',
    roles: ['inspector'],
    requestSchema: evidenceUploadRequestSchema,
    responseSchema: evidenceSchema,
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
  submitInspection: {
    method: 'POST',
    path: '/api/inspections/:id/submit',
    roles: ['inspector'],
    requestSchema: null,
    responseSchema: submitInspectionResponseSchema,
    successStatus: 201,
  },
  reviewQueue: {
    method: 'GET',
    path: '/api/review/queue',
    roles: ['supervisor', 'hq'],
    requestSchema: null,
    responseSchema: reviewQueueResponseSchema,
    successStatus: 200,
  },
  reviewInspection: {
    method: 'POST',
    path: '/api/inspections/:id/review',
    roles: ['supervisor'],
    requestSchema: reviewRequestSchema,
    responseSchema: reviewResponseSchema,
    successStatus: 201,
  },
  dashboardSites: {
    method: 'GET',
    path: '/api/dashboard/sites',
    roles: ['supervisor', 'hq'],
    requestSchema: null,
    responseSchema: dashboardSitesResponseSchema,
    successStatus: 200,
  },
  listInspectionMessages: {
    method: 'GET',
    path: '/api/inspections/:id/messages',
    roles: userRoles,
    requestSchema: z.object({
      after: z.coerce.number().int().positive().optional(),
      before: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().max(100).default(50),
    }),
    responseSchema: chatMessagesResponseSchema,
    successStatus: 200,
  },
  createInspectionMessage: {
    method: 'POST',
    path: '/api/inspections/:id/messages',
    roles: ['inspector', 'supervisor'],
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
    roles: ['inspector'],
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
    roles: ['supervisor', 'hq'],
    requestSchema: null,
    responseSchema: adminSitesResponseSchema,
    successStatus: 200,
  },
  createAdminSite: {
    method: 'POST',
    path: '/api/admin/sites',
    roles: ['supervisor', 'hq'],
    requestSchema: createSiteRequestSchema,
    responseSchema: siteResponseSchema,
    successStatus: 201,
  },
  updateAdminSite: {
    method: 'PATCH',
    path: '/api/admin/sites/:id',
    roles: ['supervisor', 'hq'],
    requestSchema: updateSiteRequestSchema,
    responseSchema: siteResponseSchema,
    successStatus: 200,
  },
  listAdminTemplates: {
    method: 'GET',
    path: '/api/admin/templates',
    roles: ['supervisor', 'hq'],
    requestSchema: null,
    responseSchema: adminTemplatesResponseSchema,
    successStatus: 200,
  },
  createAdminTemplate: {
    method: 'POST',
    path: '/api/admin/templates',
    roles: ['supervisor', 'hq'],
    requestSchema: createTemplateRequestSchema,
    responseSchema: templateResponseSchema,
    successStatus: 201,
  },
  updateAdminTemplate: {
    method: 'PUT',
    path: '/api/admin/templates/:id',
    roles: ['supervisor', 'hq'],
    requestSchema: updateTemplateRequestSchema,
    responseSchema: templateResponseSchema,
    successStatus: 200,
  },
  setCurrentAdminTemplate: {
    method: 'POST',
    path: '/api/admin/templates/:id/current',
    roles: ['supervisor', 'hq'],
    requestSchema: null,
    responseSchema: templateResponseSchema,
    successStatus: 200,
  },
} as const satisfies Record<string, ApiRouteDefinition>;

export type ApiRouteKey = keyof typeof apiRoutes;

export function apiRoutePath(route: ApiRouteDefinition) {
  return route.path.slice('/api'.length);
}

export type UserRole = z.infer<typeof userRoleSchema>;
export type InspectionStatus = z.infer<typeof inspectionStatusSchema>;
export type InspectionItemResult = z.infer<typeof inspectionItemResultSchema>;
export type ReviewAction = z.infer<typeof reviewActionSchema>;
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type Site = z.infer<typeof siteSchema>;
export type User = z.infer<typeof userSchema>;
export type Template = z.infer<typeof templateSchema>;
export type TemplateItem = z.infer<typeof templateItemSchema>;
export type Inspection = z.infer<typeof inspectionSchema>;
export type InspectionItem = z.infer<typeof inspectionItemSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type TodayResponse = z.infer<typeof todayResponseSchema>;
export type CreateInspectionRequest = z.infer<
  typeof createInspectionRequestSchema
>;
export type InspectionDetail = z.infer<typeof inspectionDetailSchema>;
export type UpdateInspectionItemRequest = z.infer<
  typeof updateInspectionItemRequestSchema
>;
export type SignedEvidenceResponse = z.infer<
  typeof signedEvidenceResponseSchema
>;
export type UpdateInspectionItemResponse = z.infer<
  typeof updateInspectionItemResponseSchema
>;
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;
export type ReviewResponse = z.infer<typeof reviewResponseSchema>;
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
export type CanSupervisorApprove = (
  items: readonly InspectionItem[],
) => boolean;
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
    input.items.some(
      (item) =>
        item.photoRequired && (input.evidenceCountByItemId[item.id] ?? 0) < 1,
    )
  )
    throw new Error('INCOMPLETE');
}

export function canSupervisorApprove(items: readonly InspectionItem[]) {
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
