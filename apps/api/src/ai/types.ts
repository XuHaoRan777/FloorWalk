import type { AiReviewInput, AiReviewResult } from '@libs/shared';

export interface AiReviewer {
  review(input: AiReviewInput): Promise<AiReviewResult>;
}

export type AiClient = (
  input: AiReviewInput,
  signal: AbortSignal,
) => Promise<unknown>;
