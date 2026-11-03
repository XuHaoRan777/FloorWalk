import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import OpenAI from 'openai';
import { aiReviewOutputSchema } from '@libs/shared';
import { expect, it } from 'vitest';
import { OssStorageDriver } from './oss.js';

const missingKeys = [
  'OSS_REGION',
  'OSS_BUCKET',
  'OSS_ACCESS_KEY_ID',
  'OSS_ACCESS_KEY_SECRET',
  'OSS_PREFIX',
].filter((key) => !process.env[key]?.trim());
const enabled = process.env.FW_OSS_SMOKE === '1';
const skipReason = missingKeys.length
  ? ` (missing: ${missingKeys.join(', ')})`
  : '';

function safeFailure(error: unknown) {
  const failure = error as {
    code?: unknown;
    status?: unknown;
    name?: unknown;
  } | null;
  const knownCodes = new Set([
    'AccessDenied',
    'SignatureDoesNotMatch',
    'InvalidAccessKeyId',
    'NoSuchBucket',
    'RequestTimeTooSkewed',
    'ENOTFOUND',
    'ECONNRESET',
    'CERT_HAS_EXPIRED',
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'RequestError',
    'InvalidArgument',
    'InvalidBucketName',
    'ConnectionTimeoutError',
  ]);
  const code =
    typeof failure?.code === 'string' && knownCodes.has(failure.code)
      ? failure.code
      : 'unclassified';
  const status = typeof failure?.status === 'number' ? failure.status : 'none';
  return `code=${code}, status=${status}`;
}

it.skipIf(!enabled || missingKeys.length > 0)(
  `round-trips a private JPEG through real OSS and removes it${skipReason}`,
  async () => {
    const driver = new OssStorageDriver();
    const key = `smoke/${randomUUID()}.jpg`;
    const photo = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .jpeg()
      .toBuffer();
    let phase = 'put';
    let failure: string | undefined;
    try {
      await driver.put(key, photo, 'image/jpeg');
      phase = 'signed GET';
      const { url } = await driver.signedUrl(key, 60);
      const signed = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      expect(signed.status).toBe(200);
      expect(signed.headers.get('content-type')).toBe('image/jpeg');
      expect(Buffer.from(await signed.arrayBuffer()).equals(photo)).toBe(true);

      phase = 'unsigned GET';
      const unsignedUrl = new URL(url);
      unsignedUrl.search = '';
      const unsigned = await fetch(unsignedUrl, {
        signal: AbortSignal.timeout(15_000),
      });
      await unsigned.arrayBuffer();
      expect(unsigned.status).toBe(403);

      phase = 'delete';
      await driver.delete(key);
      phase = 'GET after delete';
      await expect(driver.get(key)).rejects.toBeInstanceOf(NotFoundException);
    } catch (error) {
      // SDK errors can contain credentials and signed URLs; report only the phase.
      failure = `OSS smoke failed during ${phase} (${safeFailure(error)}).`;
    } finally {
      try {
        await driver.delete(key);
      } catch (error) {
        failure = `${failure ?? ''} Cleanup failed (${safeFailure(error)}); object=${key}.`;
      }
    }
    if (failure) throw new Error(failure);
  },
  180_000,
);

const missingAiKeys = ['OPENAI_API_KEY', 'OPENAI_MODEL'].filter(
  (key) => !process.env[key]?.trim(),
);
const directImageSchema = {
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
const combinedEnabled =
  process.env.FW_OSS_SMOKE === '1' && process.env.FW_AI_SMOKE === '1';
const combinedSkipReason = [...missingKeys, ...missingAiKeys];

it.skipIf(!combinedEnabled || combinedSkipReason.length > 0)(
  `sends an OSS signed image URL through the real reviewer and removes the object${combinedSkipReason.length ? ` (missing: ${combinedSkipReason.join(', ')})` : ''}`,
  async () => {
    const storage = new OssStorageDriver();
    const key = `smoke/${randomUUID()}.png`;
    const square = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();
    const image = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([{ input: square, left: 220, top: 140 }])
      .png()
      .toBuffer();
    try {
      await storage.put(key, image, 'image/png');
      const { url } = await storage.signedUrl(key, 120);
      const sdk = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL?.trim().replace(
          /\/chat\/completions\/?$/,
          '',
        ),
        maxRetries: 0,
        timeout: 60_000,
      });
      const started = Date.now();
      let response;
      try {
        response = await sdk.chat.completions.create({
          model: process.env.OPENAI_MODEL!,
          messages: [
            {
              role: 'system',
              content:
                '按检查标准检查照片，并严格按 JSON schema 返回。理由需简述照片是否可读及是否看到红色方块。',
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: '检查项：红色方块。标准：照片里应有红色方块。',
                },
                { type: 'image_url', image_url: { url } },
              ],
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'floorwalk_review',
              strict: true,
              schema: directImageSchema,
            },
          },
        });
      } catch (error) {
        const status =
          error && typeof error === 'object' && 'status' in error
            ? String(error.status)
            : 'unavailable';
        throw new Error(
          `Direct OSS image URL model request failed (status=${status}).`,
        );
      }
      const content = response.choices[0]?.message.content ?? '';
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = undefined;
      }
      const responseShape = Array.isArray(parsed)
        ? `array(${parsed.length})`
        : typeof parsed;
      const normalized =
        Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : parsed;
      const result = aiReviewOutputSchema.safeParse(normalized);
      console.log(
        JSON.stringify({
          smoke: 'FW-023 OSS signed URL + AI direct URL',
          responseShape,
          result: result.success ? result.data : 'invalid schema',
          validationIssues: !result.success
            ? result.error.issues.map((issue) => ({
                path: issue.path.join('.'),
                message: issue.message,
              }))
            : undefined,
          refusal: response.choices[0]?.message.refusal ?? null,
          elapsedMs: Date.now() - started,
          usage: response.usage
            ? {
                input: response.usage.prompt_tokens,
                output: response.usage.completion_tokens,
                total: response.usage.total_tokens,
              }
            : null,
        }),
      );
      expect(result.success).toBe(true);
    } finally {
      await storage.delete(key);
    }
  },
  180_000,
);
