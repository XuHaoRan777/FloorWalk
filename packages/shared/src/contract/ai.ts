import { z } from 'zod';
import { uuid } from './identity.js';

export const aiReviewPhotoSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('url'),
    url: z.string().url(),
  }),
  z.object({
    kind: z.literal('base64'),
    base64: z.string().min(1),
  }),
]);

export const aiReviewConclusionSchema = z.enum(['pass', 'rework', 'fail']);
export const aiReviewJobStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'manual',
  'cancelled',
]);

export const aiReviewInputSchema = z.object({
  reviewPrompt: z.string(),
  templateName: z.string().min(1),
  items: z.array(
    z.object({
      itemId: uuid,
      title: z.string().min(1),
      critical: z.boolean(),
      minPhotos: z.number().int().nonnegative(),
      acceptanceCriteria: z.string(),
      selfResult: z.enum(['pass', 'fail']),
      expectedConclusion: aiReviewConclusionSchema.optional(),
      photos: z.array(aiReviewPhotoSchema),
    }),
  ),
});

export const aiReviewOutputSchema = z
  .object({
    verdict: aiReviewConclusionSchema,
    items: z.array(
      z.object({
        itemId: uuid,
        verdict: aiReviewConclusionSchema,
        reason: z.string().trim().min(1).max(500).nullable(),
      }),
    ),
    reworkItemIds: z.array(uuid),
  })
  .superRefine((output, context) => {
    for (const [index, item] of output.items.entries()) {
      if (item.verdict !== 'pass' && !item.reason) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'reason'],
          message: '打回或不合格必须附理由。',
        });
      }
    }
  });

export const aiNeedsHumanSchema = z.object({
  kind: z.literal('needs_human'),
  reason: z.string().min(1),
});

export const aiReviewResultSchema = z.union([
  aiReviewOutputSchema,
  aiNeedsHumanSchema,
]);

export type AiReviewPhoto = z.infer<typeof aiReviewPhotoSchema>;
export type AiReviewConclusion = z.infer<typeof aiReviewConclusionSchema>;
export type AiReviewJobStatus = z.infer<typeof aiReviewJobStatusSchema>;
export type AiReviewInput = z.infer<typeof aiReviewInputSchema>;
export type AiReviewOutput = z.infer<typeof aiReviewOutputSchema>;
export type AiNeedsHuman = z.infer<typeof aiNeedsHumanSchema>;
export type AiReviewResult = z.infer<typeof aiReviewResultSchema>;
