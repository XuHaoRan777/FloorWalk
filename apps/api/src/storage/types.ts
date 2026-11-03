import type { Readable } from 'node:stream';

export interface StorageDriver {
  put(key: string, buffer: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<{ stream: Readable; mime: string }>;
  delete(key: string): Promise<void>;
  signedUrl(
    key: string,
    expiresInSeconds: number,
  ): Promise<{
    url: string;
    expiresAt: string;
  }>;
}
