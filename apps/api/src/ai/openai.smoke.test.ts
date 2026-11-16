import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import OpenAI from 'openai';
import sharp from 'sharp';
import {
  aiReviewOutputSchema,
  aiReviewResultSchema,
  type AiReviewInput,
} from '@libs/shared';
import { OpenAiReviewer, type OpenAiClient } from './openai.js';
import { LocalStorageDriver } from '../storage/local.js';

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
    const storage = new LocalStorageDriver();
    const key = `smoke/fw030/${crypto.randomUUID()}.jpg`;
    const previousPublicBaseUrl = process.env.API_PUBLIC_BASE_URL;
    let server: ReturnType<typeof createServer> | undefined;
    let downloads = 0;
    const started = Date.now();
    let result: ReturnType<typeof aiReviewResultSchema.parse> | undefined;
    let parsed: ReturnType<typeof aiReviewOutputSchema.safeParse>;
    try {
      await storage.put(key, jpeg, 'image/jpeg');
      server = createServer((request, response) => {
        void (async () => {
          const url = new URL(request.url ?? '/', 'http://127.0.0.1');
          const encodedKey = url.pathname.slice('/storage/'.length);
          const storedKey = decodeURIComponent(encodedKey);
          await storage.verifySignedUrl(
            storedKey,
            url.searchParams.get('expires'),
            url.searchParams.get('signature'),
          );
          const image = await storage.get(storedKey);
          downloads += 1;
          response.setHeader('Content-Type', image.mime);
          image.stream.pipe(response);
        })().catch(() => {
          response.statusCode = 403;
          response.end();
        });
      });
      await new Promise<void>((resolve) =>
        server!.listen(0, '127.0.0.1', resolve),
      );
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Local probe server did not bind.');
      process.env.API_PUBLIC_BASE_URL = `http://127.0.0.1:${address.port}`;
      const { url } = await storage.signedUrl(key, 60);
      input.items[0].photos = [{ kind: 'url', url }];

      result = aiReviewResultSchema.parse(
        await new OpenAiReviewer(client).review(input),
      );
      let rawOutput: unknown;
      try {
        rawOutput = JSON.parse(raw?.choices[0]?.message.content ?? '');
      } catch {
        /* Invalid JSON is reported through needs_human without dumping the body. */
      }
      parsed = aiReviewOutputSchema.safeParse(rawOutput);
      expect(downloads).toBe(1);
      expect(calls).toBe(1);
      if ('kind' in result) expect(result.reason.length).toBeGreaterThan(0);
      else expect(aiReviewOutputSchema.parse(result)).toEqual(result);
    } finally {
      if (server)
        await new Promise<void>((resolve, reject) =>
          server!.close((error) => (error ? reject(error) : resolve())),
        );
      await storage.delete(key);
      if (previousPublicBaseUrl === undefined)
        delete process.env.API_PUBLIC_BASE_URL;
      else process.env.API_PUBLIC_BASE_URL = previousPublicBaseUrl;
    }
    const needsHuman = result && 'kind' in result;
    const report = [
      '# FW-030 模型探针',
      '',
      `- 日期：${new Date().toISOString().slice(0, 10)}`,
      '- 图片输入：通过；合成 640x480 JPEG 经本地存储签名链接读取。',
      `- 签名链接下载：${downloads === 1 ? '通过' : '失败'}；有效签名读取 ${downloads} 次，smoke 对象已清理。`,
      `- 结构化输出：${parsed.success ? '通过' : '未通过'}；${parsed.success ? 'JSON 通过共享 schema 校验。' : '未取得可解析的结构化输出。'}`,
      `- 模型结论：${parsed.success ? parsed.data.verdict : needsHuman ? '待人工' : '无有效结论'}。`,
      `- 调用耗时：${Date.now() - started} ms。`,
      '- 数据边界：仅发送测试代码生成的红色方块图片，不含门店照片。',
      '',
    ].join('\n');
    const reportPath = path.resolve(
      import.meta.dirname,
      '../../../../docs/work/FW-030-ai-review/evidence/model-probe.md',
    );
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, report, 'utf8');
  },
  75_000,
);
