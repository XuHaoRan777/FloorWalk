import {
  aiReviewOutputSchema,
  type AiReviewInput,
  type AiReviewResult,
} from '@libs/shared';
import OpenAI from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import { buildReviewMessages } from './prompt.js';
import type { AiReviewer } from './types.js';

export type OpenAiClient = (
  request: ChatCompletionCreateParamsNonStreaming,
  options: { signal: AbortSignal },
) => Promise<{
  choices: { message: { content: string | null } }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}>;

// This is the wire representation of the FW-017 shared output schema.
// Shared zod validation remains authoritative after decoding the response.
const outputJsonSchema = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail', 'rework'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          itemId: { type: 'string' },
          verdict: { type: 'string', enum: ['pass', 'fail'] },
          reason: { type: 'string', minLength: 1 },
        },
        required: ['itemId', 'verdict', 'reason'],
        additionalProperties: false,
      },
    },
    reworkItemIds: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'items', 'reworkItemIds'],
  additionalProperties: false,
};

function needsHuman(reason: string): AiReviewResult {
  return { kind: 'needs_human', reason };
}

export class OpenAiReviewer implements AiReviewer {
  private readonly client: OpenAiClient;
  private readonly model: string;

  constructor(
    client?: OpenAiClient,
    private readonly timeoutMs = 60_000,
  ) {
    const missing = ['OPENAI_API_KEY', 'OPENAI_MODEL'].filter(
      (key) => !process.env[key]?.trim(),
    );
    if (missing.length) {
      throw new Error(`OpenAI 配置缺少：${missing.join('、')}。`);
    }
    this.model = process.env.OPENAI_MODEL!.trim();
    if (client) {
      this.client = client;
    } else {
      const sdk = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL?.trim().replace(
          /\/chat\/completions\/?$/,
          '',
        ),
        maxRetries: 0,
        timeout: timeoutMs,
      });
      this.client = (request, options) =>
        sdk.chat.completions.create(request, options);
    }
  }

  async review(input: AiReviewInput): Promise<AiReviewResult> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.performReview(input, controller.signal),
        new Promise<AiReviewResult>((resolve) => {
          timer = setTimeout(() => {
            controller.abort();
            resolve(needsHuman('AI 审核超时，请人工审核。'));
          }, this.timeoutMs);
        }),
      ]);
    } catch (error) {
      return needsHuman(
        controller.signal.aborted ||
          error instanceof OpenAI.APIConnectionTimeoutError
          ? 'AI 审核超时，请人工审核。'
          : 'AI 调用失败，请人工审核。',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async performReview(
    input: AiReviewInput,
    signal: AbortSignal,
  ): Promise<AiReviewResult> {
    const messages = await buildReviewMessages(input, signal);
    signal.throwIfAborted();
    const response = await this.client(
      {
        model: this.model,
        messages,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'floorwalk_review',
            strict: true,
            schema: outputJsonSchema,
          },
        },
      },
      { signal },
    );
    let decoded: unknown;
    try {
      decoded = JSON.parse(response.choices[0]?.message.content ?? '');
    } catch {
      return needsHuman('AI 未返回合法 JSON，请人工审核。');
    }
    const parsed = aiReviewOutputSchema.safeParse(decoded);
    if (!parsed.success) {
      return needsHuman('AI 结果不符合审核格式，请人工审核。');
    }
    const output = parsed.data;
    const expected = new Set(input.items.map((item) => item.itemId));
    const actual = new Set(output.items.map((item) => item.itemId));
    if (
      expected.size !== input.items.length ||
      actual.size !== output.items.length ||
      actual.size !== expected.size ||
      output.items.some((item) => !expected.has(item.itemId)) ||
      output.reworkItemIds.some((id) => !expected.has(id))
    ) {
      return needsHuman('AI 返回的检查项编号不匹配，请人工审核。');
    }
    const critical = new Set(
      input.items.filter((item) => item.critical).map((item) => item.itemId),
    );
    if (
      output.verdict === 'pass' &&
      output.items.some(
        (item) => critical.has(item.itemId) && item.verdict === 'fail',
      )
    ) {
      return needsHuman('AI 整单结论与严重项结论矛盾，请人工审核。');
    }
    return output;
  }
}
