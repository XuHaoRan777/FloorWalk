import { z } from 'zod';
import { uuid } from './identity.js';

const weekdaySchema = z.number().int().min(1).max(7);
const localTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const scheduleTaskSchema = z.object({
  templateId: uuid,
  startsAt: localTimeSchema,
  endsAt: localTimeSchema,
});

export const scheduleDaySchema = z.object({
  weekday: weekdaySchema,
  enabled: z.boolean(),
  tasks: z.array(scheduleTaskSchema),
});

const scheduleDefinitionBaseSchema = z.object({
  name: z.string().trim().min(1),
  days: z.array(scheduleDaySchema).length(7),
});

function validateWeekdays(
  { days }: { days: z.infer<typeof scheduleDefinitionBaseSchema>['days'] },
  context: z.RefinementCtx,
) {
  const weekdays = new Set(days.map((day) => day.weekday));
  if (weekdays.size !== 7)
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['days'],
      message: '日程必须且只能包含周一至周日各一天。',
    });
}

export const scheduleDefinitionSchema =
  scheduleDefinitionBaseSchema.superRefine(validateWeekdays);

export const adminScheduleSchema = scheduleDefinitionBaseSchema
  .extend({ id: uuid })
  .superRefine(validateWeekdays);

export const adminSchedulesResponseSchema = z.array(adminScheduleSchema);
export const scheduleResponseSchema = adminScheduleSchema;

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    try {
      return (
        new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
      );
    } catch {
      return false;
    }
  });

export const assignScheduleRequestSchema = z.object({
  siteIds: z.array(uuid).min(1),
  scheduleId: uuid.nullable(),
});

export const addScheduleSkipsRequestSchema = z
  .object({
    siteIds: z.array(uuid).min(1),
    startsOn: isoDateSchema,
    endsOn: isoDateSchema,
    note: z.string().nullable().optional(),
  })
  .refine((value) => value.startsOn <= value.endsOn, {
    path: ['endsOn'],
    message: '结束日期不能早于开始日期。',
  });

export const scheduleSkipSchema = z.object({
  id: uuid,
  startsOn: isoDateSchema,
  endsOn: isoDateSchema,
  note: z.string().nullable(),
});

export const adminSiteScheduleSchema = z.object({
  siteId: uuid,
  siteCode: z.string().min(1),
  siteName: z.string().min(1),
  active: z.boolean(),
  scheduleId: uuid.nullable(),
  scheduleName: z.string().nullable(),
  skippedRanges: z.array(scheduleSkipSchema),
});

export const adminSiteSchedulesResponseSchema = z.array(
  adminSiteScheduleSchema,
);

export type ScheduleTask = z.infer<typeof scheduleTaskSchema>;
export type ScheduleDay = z.infer<typeof scheduleDaySchema>;
export type ScheduleDefinition = z.infer<typeof scheduleDefinitionSchema>;
export type AdminSchedule = z.infer<typeof adminScheduleSchema>;
export type AdminSiteSchedule = z.infer<typeof adminSiteScheduleSchema>;
export type AssignScheduleRequest = z.infer<typeof assignScheduleRequestSchema>;
export type AddScheduleSkipsRequest = z.infer<
  typeof addScheduleSkipsRequestSchema
>;
