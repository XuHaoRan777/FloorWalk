import { z } from 'zod';
import { uuid } from './identity.js';

export const selfCheckStatsQuerySchema = z
  .object({
    scope: z.enum(['site', 'manager']),
    id: uuid,
    from: z.string().date(),
    to: z.string().date(),
  })
  .refine((value) => value.from <= value.to, {
    path: ['to'],
    message: '结束日期不能早于开始日期。',
  });

export const selfCheckStatsResponseSchema = z.object({
  sampleCount: z.number().int().nonnegative(),
  matchingCount: z.number().int().nonnegative(),
  accuracy: z.number().min(0).max(1).nullable(),
});

export type SelfCheckStatsQuery = z.infer<typeof selfCheckStatsQuerySchema>;
export type SelfCheckStatsResponse = z.infer<
  typeof selfCheckStatsResponseSchema
>;
