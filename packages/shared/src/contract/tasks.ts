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
