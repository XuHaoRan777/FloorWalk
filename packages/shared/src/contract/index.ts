import { z } from 'zod';

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
  token: z.string().min(1),
  user: userSchema,
});

export const todayResponseSchema = z.object({
  template: templateSchema.extend({
    items: z.array(templateItemSchema),
  }),
  submittedToday: z.boolean(),
  reworkInspections: z.array(inspectionSchema),
});

export const createInspectionRequestSchema = z.object({
  templateId: uuid,
});

export const inspectionDetailSchema = inspectionSchema.extend({
  items: z.array(
    inspectionItemSchema.extend({
      evidence: z.array(evidenceSchema),
    }),
  ),
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
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;
export type DashboardSitesResponse = z.infer<
  typeof dashboardSitesResponseSchema
>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

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
