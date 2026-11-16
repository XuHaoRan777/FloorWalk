import type { AiReviewInput, AiReviewConclusion } from '@libs/shared';
import { safeReview } from './safe-review.js';
import type { AiClient, AiReviewer } from './types.js';

const fakeClient: AiClient = async (input) => {
  const items = input.items.map((item) => {
    const verdict: AiReviewConclusion =
      item.expectedConclusion ?? item.selfResult;
    const reason =
      verdict === 'pass'
        ? '模拟审核通过。'
        : verdict === 'rework'
          ? '模拟审核打回。'
          : '模拟审核不合格。';
    return { itemId: item.itemId, verdict, reason };
  });
  const verdict = items.some((item) => item.verdict === 'rework')
    ? 'rework'
    : items.some((item) => item.verdict === 'fail')
      ? 'fail'
      : 'pass';
  return {
    verdict,
    items,
    reworkItemIds: items
      .filter((item) => item.verdict === 'rework')
      .map((item) => item.itemId),
  };
};

export class FakeAiReviewer implements AiReviewer {
  constructor(
    private readonly client: AiClient = fakeClient,
    private readonly timeoutMs = 30_000,
  ) {}

  review(input: AiReviewInput) {
    return safeReview(this.client, input, this.timeoutMs);
  }
}
