import { z } from 'zod';
import { timestamp, uuid } from './identity.js';

export const inspectionTaskStatuses = [
  'not_started',
  'in_progress',
  'submitted',
  'overdue',
] as const;

export const inspectionTaskStatusSchema = z.enum(inspectionTaskStatuses);

export const inspectionTaskSchema = z.object({
  id: uuid,
  siteId: uuid,
  templateId: uuid,
  taskDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  position: z.number().int().nonnegative(),
  startsAt: timestamp,
  dueAt: timestamp,
  status: inspectionTaskStatusSchema,
  createdAt: timestamp,
});

export const inspectorTodayTaskSchema = inspectionTaskSchema.extend({
  templateName: z.string().min(1),
});

export const inspectorTaskItemSchema = z.object({
  id: uuid,
  position: z.number().int().positive(),
  title: z.string().min(1),
  minPhotoCount: z.number().int().min(0).max(10),
  acceptanceCriteria: z.string().max(500),
  result: z.enum(['pending', 'pass', 'rework', 'fail']),
  uploadedByName: z.string().min(1).nullable(),
  uploadedAt: timestamp.nullable(),
});

export const inspectorTaskDetailSchema = inspectionTaskSchema.extend({
  templateName: z.string().min(1),
  timezone: z.string().min(1),
  inspectionId: uuid.nullable(),
  inspectionStatus: z
    .enum(['draft', 'submitted', 'in_review', 'rework', 'failed', 'passed'])
    .nullable(),
  items: z.array(inspectorTaskItemSchema),
});

export const inspectionItemDecisionResults = [
  'pass',
  'rework',
  'fail',
] as const;
export const inspectionItemDecisionResultSchema = z.enum(
  inspectionItemDecisionResults,
);

export const inspectionItemSelfAssessments = ['pass', 'fail'] as const;
export const inspectionItemSelfAssessmentSchema = z.enum(
  inspectionItemSelfAssessments,
);

export const taskItemUploadMetadataSchema = z.object({
  selfAssessment: inspectionItemSelfAssessmentSchema,
  note: z.string().optional(),
});

export const taskItemUploadFilesFieldName = 'files' as const;

export const inspectionItemDecisionSchema = z.object({
  id: uuid,
  inspectionItemId: uuid,
  actorId: uuid,
  previousResult: inspectionItemDecisionResultSchema.nullable(),
  newResult: inspectionItemDecisionResultSchema,
  createdAt: timestamp,
});

export type InspectionTask = z.infer<typeof inspectionTaskSchema>;
export type InspectorTodayTask = z.infer<typeof inspectorTodayTaskSchema>;
export type InspectorTaskDetail = z.infer<typeof inspectorTaskDetailSchema>;
export type InspectionTaskStatus = z.infer<typeof inspectionTaskStatusSchema>;
export type InspectionItemDecisionResult = z.infer<
  typeof inspectionItemDecisionResultSchema
>;
export type InspectionItemSelfAssessment = z.infer<
  typeof inspectionItemSelfAssessmentSchema
>;
export type TaskItemUploadMetadata = z.infer<
  typeof taskItemUploadMetadataSchema
>;
export type InspectionItemDecision = z.infer<
  typeof inspectionItemDecisionSchema
>;
