import { createServer } from 'node:http';
import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import OpenAI from 'openai';
import sharp from 'sharp';
import {
  aiReviewResultSchema,
  type AiReviewInput,
  type AiReviewResult,
} from '@libs/shared';
import { getAiReviewer } from './index.js';
import { OpenAiReviewer, type OpenAiClient } from './openai.js';
import { readFw038CallCount, reserveFw038Call } from './request-budget.js';
import { LocalStorageDriver } from '../storage/local.js';

const reportPath = path.resolve(
  import.meta.dirname,
  '../../../../docs/work/FW-038-ai-real-model-acceptance/evidence/model-probe.md',
);
const itemId = '00000000-0000-4000-8000-000000000038';
const probeLabel = process.env.FW_AI_PROBE_LABEL?.trim() || 'AC-01 基线';
const probeSectionMarker = `<!-- FW-038 probe section: ${probeLabel} -->`;

const samples = [
  {
    label: '清晰冷柜温度 3°C',
    reading: '3°C',
    fileName: 'cold-case-3c.jpg',
    expected: ['pass'],
    blur: false,
  },
  {
    label: '清晰冷柜温度 12°C',
    reading: '12°C',
    fileName: 'cold-case-12c.jpg',
    expected: ['fail', 'rework'],
    blur: false,
  },
  {
    label: '冷柜温度 3°C 高斯模糊版',
    reading: '3°C',
    fileName: 'cold-case-3c-blurred.jpg',
    expected: ['rework'],
    blur: true,
  },
] as const;

type Sample = (typeof samples)[number];
type CallMetric = {
  latencyMs: number;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

async function createTemperatureImage(reading: string) {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
      <rect width="640" height="480" fill="#dfe4e6" />
      <rect x="76" y="42" width="488" height="396" rx="24" fill="#f8faf9" stroke="#9ba7aa" stroke-width="8" />
      <text x="320" y="128" text-anchor="middle" font-family="Arial, Microsoft YaHei, sans-serif" font-size="38" fill="#273238">冷柜温度</text>
      <rect x="132" y="166" width="376" height="196" rx="18" fill="#202b29" />
      <text x="320" y="301" text-anchor="middle" font-family="Arial, Microsoft YaHei, sans-serif" font-size="112" font-weight="700" fill="#d5f1b8">${reading}</text>
      <text x="320" y="405" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#49565b">DIGITAL THERMOMETER</text>
    </svg>`,
  );
  return sharp(svg).jpeg({ quality: 92 }).toBuffer();
}

function describeResult(result: AiReviewResult | undefined) {
  if (!result) {
    return {
      overall: '未完成',
      itemVerdict: '未完成',
      reason: '探针未取得模型结论。',
    };
  }
  if ('kind' in result) {
    return {
      overall: '待人工',
      itemVerdict: '待人工',
      reason: result.reason,
    };
  }
  const item = result.items.find((entry) => entry.itemId === itemId);
  return {
    overall: result.verdict,
    itemVerdict: item?.verdict ?? '缺少条目结论',
    reason: item?.reason ?? '模型未提供该条目的理由。',
  };
}

function cleanCell(value: string) {
  return value.replace(/[\r\n|]/g, ' ').trim();
}

async function runSample(sample: Sample) {
  expect(process.env.AI_REVIEW_DRIVER).toBe('openai');
  expect(await getAiReviewer()).toBeInstanceOf(OpenAiReviewer);

  const evidenceDir = path.dirname(reportPath);
  await mkdir(evidenceDir, { recursive: true });
  let report = '';
  try {
    report = await readFile(reportPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (!report) {
    await appendFile(
      reportPath,
      '# FW-038 真模型输出\n\n仅使用本测试程序生成的温度图片。\n',
    );
    report = '# FW-038 真模型输出\n\n仅使用本测试程序生成的温度图片。\n';
  }
  if (!report.includes(probeSectionMarker)) {
    await appendFile(reportPath, `\n${probeSectionMarker}\n## ${probeLabel}\n`);
  }

  const sdk = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL?.trim().replace(
      /\/chat\/completions\/?$/,
      '',
    ),
    maxRetries: 0,
    timeout: 60_000,
  });
  const metrics: CallMetric[] = [];
  const client: OpenAiClient = async (request, options) => {
    const startedAt = performance.now();
    try {
      const response = await sdk.chat.completions.create(request, options);
      metrics.push({
        latencyMs: Math.round(performance.now() - startedAt),
        usage: response.usage,
      });
      return response;
    } catch (error) {
      metrics.push({
        latencyMs: Math.round(performance.now() - startedAt),
      });
      throw error;
    }
  };

  const imagePath = path.join(evidenceDir, sample.fileName);
  let sampleImage: Buffer;
  try {
    sampleImage = await readFile(imagePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const image = await createTemperatureImage(sample.reading);
    sampleImage = sample.blur
      ? await sharp(image).blur(12).jpeg({ quality: 82 }).toBuffer()
      : image;
    await writeFile(imagePath, sampleImage);
  }
  const storage = new LocalStorageDriver();
  const key = `smoke/fw038/${crypto.randomUUID()}.jpg`;
  const previousPublicBaseUrl = process.env.API_PUBLIC_BASE_URL;
  const previousBudgetFile = process.env.FW_AI_CALL_BUDGET_FILE;
  let server: ReturnType<typeof createServer> | undefined;
  let downloads = 0;
  let result: AiReviewResult | undefined;
  let setupFailed = false;
  const metricsBefore = metrics.length;

  try {
    process.env.FW_AI_CALL_BUDGET_FILE = reportPath;
    await storage.put(key, sampleImage, 'image/jpeg');
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
      throw new Error('本地图片探针服务未能启动。');
    process.env.API_PUBLIC_BASE_URL = `http://127.0.0.1:${address.port}`;
    const { url } = await storage.signedUrl(key, 60);
    const input: AiReviewInput = {
      reviewPrompt:
        '逐项对照验收要点审核照片，只依据可见证据，不要猜测无法确认的读数。',
      templateName: '冷柜温度检查',
      items: [
        {
          itemId,
          title: '冷柜温度',
          critical: false,
          minPhotos: 1,
          acceptanceCriteria: '温度在 0～5°C。',
          selfResult: 'pass',
          photos: [{ kind: 'url', url }],
        },
      ],
    };
    result = aiReviewResultSchema.parse(
      await new OpenAiReviewer(client).review(input),
    );
  } catch {
    setupFailed = true;
  } finally {
    if (server)
      await new Promise<void>((resolve, reject) =>
        server!.close((error) => (error ? reject(error) : resolve())),
      );
    await storage.delete(key);
    if (previousPublicBaseUrl === undefined)
      delete process.env.API_PUBLIC_BASE_URL;
    else process.env.API_PUBLIC_BASE_URL = previousPublicBaseUrl;
    if (previousBudgetFile === undefined)
      delete process.env.FW_AI_CALL_BUDGET_FILE;
    else process.env.FW_AI_CALL_BUDGET_FILE = previousBudgetFile;
  }

  const metric = metrics[metricsBefore];
  const details = describeResult(result);
  const currentCallCount = await readFw038CallCount(reportPath);
  const tokenUsage = metric?.usage;
  const expected = sample.expected.join(' 或 ');
  const actual = details.itemVerdict;
  const record = [
    '',
    `### ${sample.label}（${new Date().toISOString()}）`,
    `- 预期条目结论：${expected}`,
    `- 模型整单结论：${details.overall}`,
    `- 模型条目结论：${actual}`,
    `- 理由：${cleanCell(details.reason)}`,
    `- 模型请求延迟：${metric?.latencyMs ?? '未记录'} ms`,
    `- Token：prompt ${tokenUsage?.prompt_tokens ?? '未返回'} / completion ${tokenUsage?.completion_tokens ?? '未返回'} / total ${tokenUsage?.total_tokens ?? '未返回'}`,
    `- 本单元累计真实请求：${currentCallCount}/30`,
    `- 合成图片签名读取：${downloads === 1 ? '通过' : '失败'}（${downloads} 次）`,
    '',
  ].join('\n');
  await appendFile(reportPath, record);

  expect(setupFailed).toBe(false);
  expect(downloads).toBe(1);
  expect(metrics.length - metricsBefore).toBe(1);
  expect(tokenUsage).toMatchObject({
    prompt_tokens: expect.any(Number),
    completion_tokens: expect.any(Number),
    total_tokens: expect.any(Number),
  });
  expect(sample.expected).toContain(actual);
}

it('并发探针以原子方式占用额度且不会超过 30 次', async () => {
  const evidenceDir = path.dirname(reportPath);
  const testReportPath = path.join(evidenceDir, '.fw038-budget-guard-test.md');
  const claimPrefix = `${path.basename(testReportPath)}.call-`;
  await mkdir(evidenceDir, { recursive: true });
  try {
    const concurrentCalls = await Promise.all(
      Array.from({ length: 8 }, () => reserveFw038Call(testReportPath)),
    );
    expect([...concurrentCalls].sort((left, right) => left - right)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    for (let call = 8; call < 30; call += 1)
      await reserveFw038Call(testReportPath);
    expect(await readFw038CallCount(testReportPath)).toBe(30);
    await expect(reserveFw038Call(testReportPath)).rejects.toThrow(
      'FW-038 已达到 30 次真实模型请求上限。',
    );
  } finally {
    const files = await readdir(evidenceDir);
    await Promise.all(
      files
        .filter((file) => file.startsWith(claimPrefix))
        .map((file) => unlink(path.join(evidenceDir, file))),
    );
    await unlink(testReportPath).catch(() => undefined);
  }
});

for (const sample of samples) {
  it.skipIf(process.env.FW_AI_SMOKE !== '1')(
    `一次真实视觉模型审核：${sample.label}`,
    () => runSample(sample),
    75_000,
  );
}
