import { NotFoundException } from '@nestjs/common';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OssStorageDriver } from './oss.js';
import { getStorageDriver } from './index.js';

const configuration = {
  OSS_REGION: 'oss-cn-hangzhou',
  OSS_BUCKET: 'test-bucket',
  OSS_ACCESS_KEY_ID: '<secret>',
  OSS_ACCESS_KEY_SECRET: '<secret>',
  OSS_PREFIX: 'dev/',
};

function fakeClient() {
  return {
    put: vi.fn().mockResolvedValue({}),
    getStream: vi.fn().mockResolvedValue({
      stream: Readable.from(Buffer.from('photo')),
      res: { headers: { 'content-type': 'image/jpeg' } },
    }),
    delete: vi.fn().mockResolvedValue({}),
    signatureUrl: vi
      .fn()
      .mockReturnValue('https://test.invalid/photo?signature=test'),
  };
}

beforeEach(() => {
  for (const [key, value] of Object.entries(configuration))
    vi.stubEnv(key, value);
});

describe('OSS configuration at startup', () => {
  it.each(Object.keys(configuration))(
    'rejects missing %s without exposing values',
    async (missing) => {
      vi.stubEnv('STORAGE_DRIVER', 'oss');
      vi.stubEnv(missing, '');
      await expect(getStorageDriver()).rejects.toThrow(
        `OSS 配置缺失：${missing}`,
      );

      const environment: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        ...configuration,
        [missing]: '',
        STORAGE_DRIVER: 'oss',
        AI_DRIVER: 'fake',
        FW_SLOT: '2',
        HOST: '127.0.0.1',
        PORT: '3120',
        JWT_SECRET: '<secret>'.repeat(8),
        DATABASE_URL: 'postgresql://floorwalk@127.0.0.1:5433/floorwalk_e2e_2',
      };
      const child = spawnSync(
        process.execPath,
        ['--import=tsx', 'src/main.ts'],
        {
          cwd: new URL('../../', import.meta.url),
          env: environment,
          encoding: 'utf8',
          timeout: 15_000,
          windowsHide: true,
        },
      );
      expect(child.status).toBe(1);
      const output = `${child.stdout}${child.stderr}`;
      expect(output).toContain(`OSS 配置缺失：${missing}`);
      for (const value of Object.values(configuration))
        expect(output).not.toContain(value);
    },
    20_000,
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('OssStorageDriver', () => {
  const key = 'org/org-a/evidence/inspection-a/photo.jpg';

  it('prefixes all operations and preserves MIME, bytes and stream', async () => {
    const client = fakeClient();
    const driver = new OssStorageDriver(client);
    const photo = Buffer.from('photo');
    await driver.put(key, photo, 'image/jpeg');
    expect(client.put).toHaveBeenCalledWith(`dev/${key}`, photo, {
      mime: 'image/jpeg',
      headers: { 'x-oss-object-acl': 'private' },
    });
    const result = await driver.get(key);
    expect(result.stream).toBe(
      (await client.getStream.mock.results[0].value).stream,
    );
    expect(result.mime).toBe('image/jpeg');
    expect(client.getStream).toHaveBeenCalledWith(`dev/${key}`);
    await driver.delete(key);
    expect(client.delete).toHaveBeenCalledWith(`dev/${key}`);
  });

  it('signs a GET URL with the requested lifetime', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T00:00:00Z'));
    const client = fakeClient();
    const result = await new OssStorageDriver(client).signedUrl(key, 123);
    expect(client.signatureUrl).toHaveBeenCalledWith(`dev/${key}`, {
      method: 'GET',
      expires: 123,
    });
    expect(result).toEqual({
      url: 'https://test.invalid/photo?signature=test',
      expiresAt: '2026-11-03T00:02:03.000Z',
    });
  });

  it('maps a missing OSS object to the existing 404 contract', async () => {
    const client = fakeClient();
    client.getStream.mockRejectedValue(
      Object.assign(new Error(), { code: 'NoSuchKey' }),
    );
    const error = await new OssStorageDriver(client)
      .get(key)
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toEqual({
      code: 'NOT_FOUND',
      message: '照片不存在。',
    });
  });

  it('propagates network errors unchanged', async () => {
    const client = fakeClient();
    const error = Object.assign(new Error('network unavailable'), {
      code: 'ECONNRESET',
    });
    client.getStream.mockRejectedValue(error);
    client.put.mockRejectedValue(error);
    client.delete.mockRejectedValue(error);
    client.signatureUrl.mockImplementation(() => {
      throw error;
    });
    const driver = new OssStorageDriver(client);
    await expect(driver.get(key)).rejects.toBe(error);
    await expect(driver.put(key, Buffer.alloc(0), 'image/jpeg')).rejects.toBe(
      error,
    );
    await expect(driver.delete(key)).rejects.toBe(error);
    await expect(driver.signedUrl(key, 60)).rejects.toBe(error);
  });
});
