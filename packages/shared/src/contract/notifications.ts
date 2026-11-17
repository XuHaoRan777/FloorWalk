import { z } from 'zod';
import { timestamp, uuid } from './identity.js';

export const notificationTypes = [
  'item_rework',
  'inspection_decided',
  'inspection_overridden',
  'critical_item_failed',
  'task_overdue',
  'manual_review_needed',
  'chat_message',
] as const;

export const notificationTypeSchema = z.enum(notificationTypes);

const taskInspectionFields = { taskId: uuid, inspectionId: uuid };
const itemReworkPayloadSchema = z.object({
  ...taskInspectionFields,
  position: z.number().int().positive(),
  reason: z.string().min(1).max(500),
});
const inspectionDecidedPayloadSchema = z.object({
  ...taskInspectionFields,
  status: z.enum(['passed', 'failed']),
  score: z.number().int().min(0).max(100),
});
const inspectionItemPayloadSchema = z.object({
  ...taskInspectionFields,
  position: z.number().int().positive(),
});
const taskPayloadSchema = z.object({ taskId: uuid });
const chatMessagePayloadSchema = z.object({ inspectionId: uuid });

export const notificationPayloadSchema = z.union([
  itemReworkPayloadSchema,
  inspectionDecidedPayloadSchema,
  inspectionItemPayloadSchema,
  taskPayloadSchema,
  chatMessagePayloadSchema,
]);

const notificationFields = {
  id: uuid,
  createdAt: timestamp,
  readAt: timestamp.nullable(),
};

export const notificationSchema = z.discriminatedUnion('type', [
  z.object({
    ...notificationFields,
    type: z.literal('item_rework'),
    payload: itemReworkPayloadSchema,
  }),
  z.object({
    ...notificationFields,
    type: z.literal('inspection_decided'),
    payload: inspectionDecidedPayloadSchema,
  }),
  z.object({
    ...notificationFields,
    type: z.literal('inspection_overridden'),
    payload: inspectionItemPayloadSchema,
  }),
  z.object({
    ...notificationFields,
    type: z.literal('critical_item_failed'),
    payload: inspectionItemPayloadSchema,
  }),
  z.object({
    ...notificationFields,
    type: z.literal('task_overdue'),
    payload: taskPayloadSchema,
  }),
  z.object({
    ...notificationFields,
    type: z.literal('manual_review_needed'),
    payload: inspectionItemPayloadSchema,
  }),
  z.object({
    ...notificationFields,
    type: z.literal('chat_message'),
    payload: chatMessagePayloadSchema,
  }),
]);

export const notificationsResponseSchema = z.object({
  notifications: z.array(notificationSchema).max(50),
  nextCursor: uuid.nullable(),
});

export const notificationsQuerySchema = z.object({
  after: uuid.optional(),
  unread_only: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const unreadNotificationCountSchema = z.object({
  count: z.number().int().nonnegative(),
});
