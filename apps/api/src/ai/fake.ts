import type { AiReviewInput } from '@libs/shared';
import { safeReview } from './safe-review.js';
import type { AiClient, AiReviewer } from './types.js';

const fakeClient: AiClient = async (input) => ({
  verdict: input.items.some((item) => item.selfResult === 'fail')
    ? 'fail'
    : 'pass',
  items: input.items.map((item) => ({
    itemId: item.itemId,
    verdict: item.selfResult,
    reason: '模拟审核：沿用店员自评。',
  })),
  reworkItemIds: [],
});

export class FakeAiReviewer implements AiReviewer {
  constructor(
    private readonly client: AiClient = fakeClient,
    private readonly timeoutMs = 30_000,
  ) {}

  review(input: AiReviewInput) {
    return safeReview(this.client, input, this.timeoutMs);
  }
}
