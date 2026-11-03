import { FakeAiReviewer } from './fake.js';
import type { AiReviewer } from './types.js';

export type { AiReviewer, AiClient } from './types.js';
export { FakeAiReviewer } from './fake.js';
export { safeReview } from './safe-review.js';

export async function getAiReviewer(): Promise<AiReviewer> {
  const driver = process.env.AI_DRIVER ?? 'fake';
  if (driver === 'fake') return new FakeAiReviewer();
  if (driver === 'openai') {
    const modulePath = './openai.js';
    const module = await import(modulePath).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ERR_MODULE_NOT_FOUND')
          throw new Error('OpenAI 审核驱动未实现。');
        throw error;
      },
    );
    return new module.OpenAiReviewer();
  }
  throw new Error(`未知 AI 驱动：${driver}`);
}
