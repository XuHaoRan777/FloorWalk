// FW-017 capability probe. Generates a known image; never writes to the database.
// Build API first, start slot 1 API with proc.mjs, then run from the repo root.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getStorageDriver } from '../apps/api/dist/storage/index.js';

process.loadEnvFile('apps/api/.env.development');
const required = ['OPENAI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL'];
const keys = [
  'STORAGE_DRIVER',
  'AI_DRIVER',
  'OSS_REGION',
  'OSS_BUCKET',
  'OSS_ACCESS_KEY_ID',
  'OSS_ACCESS_KEY_SECRET',
  'OSS_PREFIX',
  'OSS_ENDPOINT',
  ...required,
];
console.log(
  JSON.stringify({
    configuration: Object.fromEntries(
      keys.map((key) => [key, Boolean(process.env[key])]),
    ),
  }),
);
if (required.some((key) => !process.env[key])) {
  throw new Error('AI 探针缺少 OPENAI_* 配置，见键名存在性清单。');
}
process.env.API_PUBLIC_BASE_URL = 'http://127.0.0.1:3110';
const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const { default: OpenAI } = await import(
  pathToFileURL(require.resolve('openai')).href
);
const { default: sharp } = await import(
  pathToFileURL(require.resolve('sharp')).href
);
const storage = await getStorageDriver(
  path.resolve('apps/api/.e2e/slot-1/storage'),
);
const sensitive = [
  process.env.OPENAI_API_KEY,
  process.env.OPENAI_BASE_URL,
  process.env.DATABASE_URL,
  process.env.OSS_ACCESS_KEY_ID,
  process.env.OSS_ACCESS_KEY_SECRET,
].filter(Boolean);
const redact = (value) => {
  let text = String(value);
  for (const secret of sensitive) text = text.split(secret).join('[REDACTED]');
  return text.replace(/https?:\/\/[^\s"<>]+/g, '[URL REDACTED]');
};
const client = new OpenAI({
  // Accept either the API base or a copied chat-completions endpoint.
  baseURL: process.env.OPENAI_BASE_URL.replace(/\/chat\/completions\/?$/, ''),
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 0,
  timeout: 60_000,
});
const schema = {
  type: 'object',
  properties: {
    imageReadable: { type: 'boolean' },
    imageDescription: { type: 'string' },
  },
  required: ['imageReadable', 'imageDescription'],
  additionalProperties: false,
};
async function probe(kind, imageUrl) {
  const started = Date.now();
  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '这是图片传输探针。请实际查看附图，用中文客观描述看到的颜色、形状或内容；若没有可辨识物体，直接说明。能读取图像则 imageReadable=true，无法读取则 false。不要推测巡检结果。',
            },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'floorwalk_image_probe',
          strict: true,
          schema,
        },
      },
    });
    const content = response.choices[0]?.message.content ?? '';
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      /* Report exact sanitized output below. */
    }
    const structured =
      typeof parsed?.imageReadable === 'boolean' &&
      typeof parsed?.imageDescription === 'string' &&
      Object.keys(parsed).length === 2;
    const result = {
      kind,
      status: 'response',
      structured,
      imageReadable:
        structured &&
        parsed.imageReadable &&
        /红/.test(parsed.imageDescription) &&
        /方形|方块|正方/.test(parsed.imageDescription),
      content: redact(content),
      elapsedMs: Date.now() - started,
      usage: response.usage,
    };
    console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    const result = {
      kind,
      status: 'error',
      statusCode: error.status,
      code: error.code,
      message: redact(error.message),
      elapsedMs: Date.now() - started,
    };
    console.log(JSON.stringify(result));
    return result;
  }
}
const probeKey = `org/00000000-0000-4000-8000-000000000017/probe/${randomUUID()}.jpg`;
try {
  const square = await sharp({
    create: {
      width: 200,
      height: 200,
      channels: 3,
      background: '#ff0000',
    },
  })
    .png()
    .toBuffer();
  const bytes = await sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      background: '#ffffff',
    },
  })
    .composite([{ input: square, left: 220, top: 140 }])
    .jpeg({ quality: 80 })
    .toBuffer();
  const metadata = await sharp(bytes).metadata();
  console.log(
    JSON.stringify({
      generatedImage: {
        width: metadata.width,
        height: metadata.height,
        bytes: bytes.length,
      },
    }),
  );
  await storage.put(probeKey, bytes, 'image/jpeg');
  const signed = await storage.signedUrl(probeKey, 300);
  const localResponse = await fetch(signed.url);
  console.log(JSON.stringify({ localSignedUrlStatus: localResponse.status }));
  if (!localResponse.ok) throw new Error('本地签名链接自身不可读，停止探针。');
  const urlResult = await probe('signed-url', signed.url);
  // Localhost is normally unreachable from the provider. Only fall back once.
  const result = urlResult.imageReadable
    ? urlResult
    : await probe(
        'base64',
        `data:image/jpeg;base64,${bytes.toString('base64')}`,
      );
  if (!result.imageReadable) process.exitCode = 1;
} finally {
  await storage.delete(probeKey);
}
