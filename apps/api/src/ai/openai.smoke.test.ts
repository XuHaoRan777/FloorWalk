import { expect, it } from 'vitest';
import OpenAI from 'openai';
import sharp from 'sharp';
import {
  aiReviewOutputSchema,
  aiReviewResultSchema,
  type AiReviewInput,
} from '@libs/shared';
import { OpenAiReviewer, type OpenAiClient } from './openai.js';

it.skipIf(process.env.FW_AI_SMOKE !== '1')(
  '一次真实视觉模型审核，只断言共享 schema 或明确转人工',
  async () => {
    const square = await sharp({
      create: { width: 200, height: 200, channels: 3, background: '#ff0000' },
    })
      .png()
      .toBuffer();
    const jpeg = await sharp({
      create: { width: 640, height: 480, channels: 3, background: '#ffffff' },
    })
      .composite([{ input: square, left: 220, top: 140 }])
      .jpeg({ quality: 80 })
      .toBuffer();
    const input: AiReviewInput = {
      reviewPrompt: '照片里应有红色方块。',
      templateName: '视觉冒烟测试',
      items: [
        {
          itemId: '00000000-0000-4000-8000-000000000022',
          title: '红色方块',
          photoRequired: true,
          critical: true,
          minPhotos: 1,
          acceptanceCriteria: '照片里应有红色方块。',
          selfResult: 'pass',
          photos: [{ kind: 'base64', base64: jpeg.toString('base64') }],
        },
      ],
    };
    const sdk = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL?.trim().replace(
        /\/chat\/completions\/?$/,
        '',
      ),
      maxRetries: 0,
      timeout: 60_000,
    });
    let raw: Awaited<ReturnType<OpenAiClient>> | undefined;
    let calls = 0;
    const client: OpenAiClient = async (request, options) => {
      calls += 1;
      raw = await sdk.chat.completions.create(request, options);
      return raw;
    };
    const started = Date.now();
    const result = aiReviewResultSchema.parse(
      await new OpenAiReviewer(client).review(input),
    );
    let rawOutput: unknown;
    try {
      rawOutput = JSON.parse(raw?.choices[0]?.message.content ?? '');
    } catch {
      /* Invalid JSON is reported through needs_human without dumping the body. */
    }
    const parsed = aiReviewOutputSchema.safeParse(rawOutput);
    const safeReason = (reason: string) => {
      let redacted = reason.replace(/https?:\/\/[^\s"<>]+/g, '[URL REDACTED]');
      for (const key of ['OPENAI_API_KEY', 'OPENAI_BASE_URL']) {
        const value = process.env[key];
        if (value) redacted = redacted.split(value).join('[REDACTED]');
      }
      return redacted.slice(0, 50);
    };
    console.log(
      JSON.stringify({
        smoke: 'FW-022',
        image: { width: 640, height: 480, bytes: jpeg.length },
        elapsedMs: Date.now() - started,
        verdict: parsed.success ? parsed.data.verdict : null,
        items: parsed.success
          ? parsed.data.items.map((item) => ({
              itemId: item.itemId,
              verdict: item.verdict,
              reason: safeReason(item.reason),
            }))
          : [],
        needsHumanReason: 'kind' in result ? result.reason : null,
        usage: raw?.usage
          ? {
              input: raw.usage.prompt_tokens,
              output: raw.usage.completion_tokens,
              total: raw.usage.total_tokens,
            }
          : null,
      }),
    );
    expect(calls).toBe(1);
    if ('kind' in result) expect(result.reason.length).toBeGreaterThan(0);
    else expect(aiReviewOutputSchema.parse(result)).toEqual(result);
  },
  75_000,
);
