import { NotFoundException } from '@nestjs/common';
import { createRequire } from 'node:module';
import type { Readable } from 'node:stream';
import type { StorageDriver } from './types.js';

interface OssClient {
  put(
    key: string,
    buffer: Buffer,
    options: { mime: string; headers: Record<string, string> },
  ): Promise<unknown>;
  getStream(key: string): Promise<{
    stream: Readable;
    res: { headers: Record<string, string | undefined> };
  }>;
  delete(key: string): Promise<unknown>;
  signatureUrl(
    key: string,
    options: { method: 'GET'; expires: number },
  ): string;
}

export class OssStorageDriver implements StorageDriver {
  private readonly client: OssClient;
  private readonly prefix: string;

  constructor(client?: OssClient) {
    const requiredKeys = [
      'OSS_REGION',
      'OSS_BUCKET',
      'OSS_ACCESS_KEY_ID',
      'OSS_ACCESS_KEY_SECRET',
      'OSS_PREFIX',
    ] as const;
    const missing = requiredKeys.filter((key) => !process.env[key]?.trim());
    if (missing.length) {
      throw new Error(`OSS 配置缺失：${missing.join('、')}`);
    }
    this.prefix = process.env.OSS_PREFIX!.replace(/^\/+|\/+$/g, '');
    // ali-oss ships CommonJS without declarations; keep its untyped boundary here.
    const Oss = createRequire(import.meta.url)('ali-oss') as new (options: {
      region: string;
      bucket: string;
      accessKeyId: string;
      accessKeySecret: string;
      endpoint?: string;
      secure: boolean;
    }) => OssClient;
    this.client =
      client ??
      new Oss({
        region: process.env.OSS_REGION!,
        bucket: process.env.OSS_BUCKET!,
        accessKeyId: process.env.OSS_ACCESS_KEY_ID!,
        accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET!,
        endpoint: process.env.OSS_ENDPOINT || undefined,
        secure: true,
      });
  }

  private objectKey(key: string) {
    return this.prefix ? `${this.prefix}/${key}` : key;
  }

  async put(key: string, buffer: Buffer, mime: string) {
    await this.client.put(this.objectKey(key), buffer, {
      mime,
      headers: { 'x-oss-object-acl': 'private' },
    });
  }

  async get(key: string) {
    try {
      const result = await this.client.getStream(this.objectKey(key));
      return {
        stream: result.stream,
        mime: result.res.headers['content-type'] ?? 'application/octet-stream',
      };
    } catch (error) {
      if ((error as { code?: string } | null)?.code === 'NoSuchKey') {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '照片不存在。',
        });
      }
      throw error;
    }
  }

  async delete(key: string) {
    await this.client.delete(this.objectKey(key));
  }

  async signedUrl(key: string, expiresInSeconds: number) {
    const expiresAt = new Date(
      Date.now() + expiresInSeconds * 1000,
    ).toISOString();
    return {
      url: this.client.signatureUrl(this.objectKey(key), {
        method: 'GET',
        expires: expiresInSeconds,
      }),
      expiresAt,
    };
  }
}
