import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
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
