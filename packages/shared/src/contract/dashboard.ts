import { z } from 'zod';
import { siteSchema, uuid } from './identity.js';
import { inspectionTaskSchema } from './tasks.js';

// FW-032 AC-01: today's task list, summary and critical-item warnings.
export const adminTodayTaskSchema = inspectionTaskSchema.extend({
  site: siteSchema,
  templateName: z.string().min(1),
  score: z.number().min(0).max(100).nullable(),
  criticalFailure: z.boolean(),
});

export const adminTodayResponseSchema = z.object({
  date: z.string().date(),
  timezone: z.string().min(1),
  tasks: z.array(adminTodayTaskSchema),
  summary: z.object({
    expected: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    overdue: z.number().int().nonnegative(),
  }),
});

export type AdminTodayTask = z.infer<typeof adminTodayTaskSchema>;
export type AdminTodayResponse = z.infer<typeof adminTodayResponseSchema>;

// FW-032 AC-02/03: fixed periods, site metrics, manager ranking and daily trend.
export const dashboardPeriodQuerySchema = z.object({
  period: z.enum(['week', 'month']).default('week'),
});

export const dashboardMetricsSchema = z.object({
  expected: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  completionRate: z.number().min(0).max(1).nullable(),
  overdue: z.number().int().nonnegative(),
  averageScore: z.number().min(0).max(100).nullable(),
});

export const dashboardPeriodResponseSchema = z.object({
  period: z.enum(['week', 'month']),
  from: z.string().date(),
  to: z.string().date(),
  timezone: z.string().min(1),
  overall: dashboardMetricsSchema,
  sites: z.array(
    z.object({ site: siteSchema, metrics: dashboardMetricsSchema }),
  ),
  managers: z.array(
    z.object({
      id: uuid,
      displayName: z.string().min(1),
      submittedItems: z.number().int().nonnegative(),
      passRate: z.number().min(0).max(1).nullable(),
    }),
  ),
  dates: z.array(
    z.object({ date: z.string().date(), metrics: dashboardMetricsSchema }),
  ),
});

export type DashboardPeriod = z.infer<
  typeof dashboardPeriodQuerySchema
>['period'];
export type DashboardMetrics = z.infer<typeof dashboardMetricsSchema>;
export type DashboardPeriodResponse = z.infer<
  typeof dashboardPeriodResponseSchema
>;
