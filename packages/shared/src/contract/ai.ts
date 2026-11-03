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

export const aiReviewInputSchema = z.object({
  reviewPrompt: z.string(),
  templateName: z.string().min(1),
  items: z.array(
    z.object({
      itemId: uuid,
      title: z.string().min(1),
      photoRequired: z.boolean(),
      critical: z.boolean(),
      minPhotos: z.number().int().nonnegative(),
      acceptanceCriteria: z.string(),
      selfResult: z.enum(['pass', 'fail']),
      photos: z.array(aiReviewPhotoSchema),
    }),
  ),
});

export const aiReviewOutputSchema = z.object({
  verdict: z.enum(['pass', 'fail', 'rework']),
  items: z.array(
    z.object({
      itemId: uuid,
      verdict: z.enum(['pass', 'fail']),
      reason: z.string().min(1),
    }),
  ),
  reworkItemIds: z.array(uuid),
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
export type AiReviewInput = z.infer<typeof aiReviewInputSchema>;
export type AiReviewOutput = z.infer<typeof aiReviewOutputSchema>;
export type AiNeedsHuman = z.infer<typeof aiNeedsHumanSchema>;
export type AiReviewResult = z.infer<typeof aiReviewResultSchema>;
