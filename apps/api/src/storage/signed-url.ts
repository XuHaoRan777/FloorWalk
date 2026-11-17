import { ForbiddenException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getJwtSecret } from '../config/auth-config.js';

function signature(key: string, expiresAt: number) {
  return createHmac('sha256', getJwtSecret())
    .update(`${key}.${expiresAt}`)
    .digest('hex');
}

export function createStorageSignedUrl(key: string, expiresInSeconds: number) {
  const base = (
    process.env.API_PUBLIC_BASE_URL ??
    `http://${process.env.HOST ?? '127.0.0.1'}:${process.env.PORT ?? '3018'}`
  ).replace(/\/$/, '');
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  return {
    url: `${base}/storage/${encodeURIComponent(key)}?expires=${expiresAt}&signature=${signature(key, expiresAt)}`,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export function verifyStorageSignedUrl(
  key: string,
  expires: unknown,
  providedSignature: unknown,
) {
  const expiresAt = Number(expires);
  const expected = Buffer.from(signature(key, expiresAt));
  const provided =
    typeof providedSignature === 'string'
      ? Buffer.from(providedSignature)
      : Buffer.alloc(0);
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Date.now() ||
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: '照片链接无效或已过期。',
    });
  }
}
