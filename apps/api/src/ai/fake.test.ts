import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiReviewOutputSchema, type AiReviewInput } from '@libs/shared';
import { FakeAiReviewer } from './fake.js';

const input: AiReviewInput = {
  reviewPrompt: '按标准审核',
  templateName: '测试模板',
  items: ['pass', 'fail'].map((selfResult, index) => ({
    itemId: `00000000-0000-4000-8000-00000000000${index}`,
    title: `检查项 ${index}`,
    photoRequired: false,
    critical: false,
    minPhotos: 0,
    acceptanceCriteria: '',
    selfResult: selfResult as 'pass' | 'fail',
    photos: [],
  })),
};

afterEach(() => vi.useRealTimers());

describe('FakeAiReviewer', () => {
  it('returns schema-valid fixed reasons and the original self results', async () => {
    const reviewer = new FakeAiReviewer();
    const result = aiReviewOutputSchema.parse(await reviewer.review(input));
    expect(result).toEqual({
      verdict: 'fail',
      items: input.items.map((item) => ({
        itemId: item.itemId,
        verdict: item.selfResult,
        reason: '模拟审核：沿用店员自评。',
      })),
      reworkItemIds: [],
    });
    const passed = await reviewer.review({ ...input, items: [input.items[0]] });
    expect(aiReviewOutputSchema.parse(passed).verdict).toBe('pass');
  });

  it('falls back to human review when the injected client returns invalid schema', async () => {
    const reviewer = new FakeAiReviewer(async () => ({ verdict: 'unknown' }));
    expect(await reviewer.review(input)).toEqual({
      kind: 'needs_human',
      reason: 'AI 结果不符合审核格式，请人工审核。',
    });
  });

  it('falls back to human review and aborts a timed out client', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const reviewer = new FakeAiReviewer(async (_, clientSignal) => {
      signal = clientSignal;
      return new Promise(() => {});
    }, 100);
    const result = reviewer.review(input);
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toEqual({
      kind: 'needs_human',
      reason: 'AI 审核超时，请人工审核。',
    });
    expect(signal?.aborted).toBe(true);
  });

  it('falls back to human review when the injected client fails', async () => {
    const reviewer = new FakeAiReviewer(async () => {
      throw new Error('test client failed');
    });
    expect(await reviewer.review(input)).toEqual({
      kind: 'needs_human',
      reason: 'AI 调用失败，请人工审核。',
    });
  });
});
