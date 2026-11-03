import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OpenAI from 'openai';
import { Test } from '@nestjs/testing';
import {
  aiReviewOutputSchema,
  type AiReviewInput,
  type AiReviewOutput,
} from '@libs/shared';
import { OpenAiReviewer, type OpenAiClient } from './openai.js';
import { AppModule } from '../app.module.js';
import { DATABASE_POOL } from '../db/pool.provider.js';
import { getAiReviewer } from './index.js';

const input: AiReviewInput = {
  reviewPrompt: '照片应当清晰。',
  templateName: '开店巡检',
  items: [1, 2].map((n) => ({
    itemId: `00000000-0000-4000-8000-00000000000${n}`,
    title: `检查项 ${n}`,
    photoRequired: false,
    critical: n === 1,
    minPhotos: 0,
    acceptanceCriteria: '',
    selfResult: 'pass',
    photos: [],
  })),
};
const output: AiReviewOutput = {
  verdict: 'pass',
  items: input.items.map((item) => ({
    itemId: item.itemId,
    verdict: 'pass',
    reason: '照片符合要求。',
  })),
  reworkItemIds: [],
};
function response(value: unknown) {
  return { choices: [{ message: { content: JSON.stringify(value) } }] };
}

beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', '<secret>');
  vi.stubEnv('OPENAI_MODEL', 'test-vision');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('OpenAI 审核输出', () => {
  it('一次请求使用配置模型和 JSON schema，结果通过共享校验', async () => {
    const client = vi.fn<OpenAiClient>().mockResolvedValue(response(output));
    const result = await new OpenAiReviewer(client).review(input);
    expect(aiReviewOutputSchema.parse(result)).toEqual(output);
    expect(client).toHaveBeenCalledOnce();
    const [request, options] = client.mock.calls[0];
    expect(request.model).toBe('test-vision');
    expect(request.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: {
        strict: true,
        schema: { required: ['verdict', 'items', 'reworkItemIds'] },
      },
    });
    expect(request.messages.map((message) => message.role)).toEqual([
      'system',
      'user',
    ]);
    expect(options.signal.aborted).toBe(false);
  });

  it.each([
    'https://example.test/v1',
    'https://example.test/v1/chat/completions/',
  ])('SDK 请求使用配置地址 %s，兼容完整 endpoint', async (baseURL) => {
    vi.stubEnv('OPENAI_BASE_URL', baseURL);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(response(output)), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    expect(await new OpenAiReviewer().review(input)).toEqual(output);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0][0])).toBe(
      'https://example.test/v1/chat/completions',
    );
  });

  it('检查项可以乱序返回，由编号对应', async () => {
    const reversed = { ...output, items: [...output.items].reverse() };
    expect(
      await new OpenAiReviewer(async () => response(reversed)).review(input),
    ).toEqual(reversed);
  });

  it.each([
    ['缺少', output.items.slice(1)],
    [
      '多出',
      [
        ...output.items,
        { ...output.items[0], itemId: '00000000-0000-4000-8000-000000000003' },
      ],
    ],
    ['重复', [output.items[0], output.items[0]]],
    [
      '替换',
      [
        output.items[0],
        { ...output.items[1], itemId: '00000000-0000-4000-8000-000000000003' },
      ],
    ],
  ])('%s检查项时转人工', async (_, items) => {
    const result = await new OpenAiReviewer(async () =>
      response({ ...output, items }),
    ).review(input);
    expect(result).toEqual({
      kind: 'needs_human',
      reason: 'AI 返回的检查项编号不匹配，请人工审核。',
    });
  });
});

describe('转人工', () => {
  it('HTTP 错误不抛出、不泄露密钥或完整请求体', async () => {
    const client = vi.fn<OpenAiClient>().mockRejectedValue(
      Object.assign(new Error(`HTTP 503 <secret> ${JSON.stringify(input)}`), {
        status: 503,
      }),
    );
    const result = await new OpenAiReviewer(client).review(input);
    expect(result).toEqual({
      kind: 'needs_human',
      reason: 'AI 调用失败，请人工审核。',
    });
    expect(JSON.stringify(result)).not.toContain('<secret>');
    expect(JSON.stringify(result)).not.toContain(input.reviewPrompt);
    expect(client).toHaveBeenCalledOnce();
  });

  it.each([undefined, 25])(
    '超时（配置 %s）终止客户端且转人工，默认 60 秒',
    async (timeoutMs) => {
      vi.useFakeTimers();
      let signal: AbortSignal | undefined;
      const client: OpenAiClient = async (_, options) => {
        signal = options.signal;
        return new Promise(() => {});
      };
      let settled = false;
      const pending = new OpenAiReviewer(client, timeoutMs)
        .review(input)
        .then((result) => {
          settled = true;
          return result;
        });
      await vi.advanceTimersByTimeAsync((timeoutMs ?? 60_000) - 1);
      expect(settled).toBe(false);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toEqual({
        kind: 'needs_human',
        reason: 'AI 审核超时，请人工审核。',
      });
      expect(signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('SDK 超时错误也返回中文超时原因', async () => {
    const reviewer = new OpenAiReviewer(async () => {
      throw new OpenAI.APIConnectionTimeoutError();
    });
    expect(await reviewer.review(input)).toEqual({
      kind: 'needs_human',
      reason: 'AI 审核超时，请人工审核。',
    });
  });

  it('非法 JSON 转人工', async () => {
    const reviewer = new OpenAiReviewer(async () => ({
      choices: [{ message: { content: 'not JSON <secret>' } }],
    }));
    expect(await reviewer.review(input)).toEqual({
      kind: 'needs_human',
      reason: 'AI 未返回合法 JSON，请人工审核。',
    });
  });

  it('共享 schema 不符转人工', async () => {
    const reviewer = new OpenAiReviewer(async () =>
      response({ ...output, verdict: 'unknown' }),
    );
    expect(await reviewer.review(input)).toEqual({
      kind: 'needs_human',
      reason: 'AI 结果不符合审核格式，请人工审核。',
    });
  });

  it('严重项不合格却整单通过，结论矛盾转人工', async () => {
    const inconsistent = {
      ...output,
      items: [{ ...output.items[0], verdict: 'fail' }, output.items[1]],
    };
    const reviewer = new OpenAiReviewer(async () => response(inconsistent));
    expect(await reviewer.review(input)).toEqual({
      kind: 'needs_human',
      reason: 'AI 整单结论与严重项结论矛盾，请人工审核。',
    });
  });
});

describe('AI 驱动启动配置', () => {
  it.each(['OPENAI_API_KEY', 'OPENAI_MODEL'])(
    'openai 缺 %s 时 API 模块无法启动，错误仅列键名',
    async (key) => {
      vi.stubEnv('AI_DRIVER', 'openai');
      vi.stubEnv(key, '');
      const startup = Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DATABASE_POOL)
        .useValue({ end: async () => {} })
        .overrideProvider('STORAGE_DRIVER')
        .useValue({})
        .compile();
      await expect(startup).rejects.toThrow(`OpenAI 配置缺少：${key}。`);
    },
  );

  it('选择 openai 时加载新适配器，默认仍为 fake', async () => {
    vi.stubEnv('AI_DRIVER', 'openai');
    expect(await getAiReviewer()).toBeInstanceOf(OpenAiReviewer);
    vi.stubEnv('AI_DRIVER', undefined);
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('OPENAI_MODEL', '');
    const reviewer = await getAiReviewer();
    expect(reviewer.constructor.name).toBe('FakeAiReviewer');
    expect(
      aiReviewOutputSchema.parse(await reviewer.review(input)).verdict,
    ).toBe('pass');
  });
});
