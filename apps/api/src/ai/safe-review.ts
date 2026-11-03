import {
  aiReviewOutputSchema,
  type AiReviewInput,
  type AiReviewResult,
} from '@libs/shared';
import type { AiClient } from './types.js';

export async function safeReview(
  client: AiClient,
  input: AiReviewInput,
  timeoutMs = 30_000,
): Promise<AiReviewResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      Promise.resolve().then(() => client(input, controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('AI timeout'));
        }, timeoutMs);
      }),
    ]);
    const parsed = aiReviewOutputSchema.safeParse(response);
    return parsed.success
      ? parsed.data
      : { kind: 'needs_human', reason: 'AI 结果不符合审核格式，请人工审核。' };
  } catch {
    return {
      kind: 'needs_human',
      reason: controller.signal.aborted
        ? 'AI 审核超时，请人工审核。'
        : 'AI 调用失败，请人工审核。',
    };
  } finally {
    clearTimeout(timer);
  }
}
