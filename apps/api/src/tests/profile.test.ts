import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';
import sharp from 'sharp';
import { currentUserSchema, maxAvatarSizeBytes } from '@libs/shared';
import { AppModule } from '../app.module.js';
import { hashSessionId } from '../auth/auth.js';
import { HttpErrorFilter } from '../filters/http-exception.filter.js';
import { createPool } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { seedDatabase } from '../db/seed.js';
import { LocalStorageDriver } from '../storage/local.js';

describe('FW-035 本人资料与头像 (AC-01/02/05)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let storage: LocalStorageDriver;
  let adminCookie: string;
  let managerCookie: string;
  let adminId: string;
  let managerId: string;
  let png: Buffer;
  let jpeg: Buffer;
  const sessionHashes: string[] = [];
  const storageKeys: string[] = [];
  let originals: Array<{
    id: string;
    displayName: string;
    avatarStorageKey: string | null;
  }> = [];

  const me = (cookie: string) =>
    request(app.getHttpServer()).get('/api/me').set('Cookie', cookie);
  const upload = (cookie: string, buffer = png, mime = 'image/png') =>
    request(app.getHttpServer())
      .post('/api/me/avatar')
      .set('Cookie', cookie)
      .attach('file', buffer, { filename: 'avatar', contentType: mime });
  const remember = (response: request.Response) => {
    storageKeys.push(response.body.storageKey);
    return response.body.storageKey as string;
  };

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    pool = createPool();
    storage = new LocalStorageDriver();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider('STORAGE_DRIVER')
      .useValue(storage)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
    const login = async (loginName: string) => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/session')
        .send({ loginName, password: 'northbean-demo' })
        .expect(201);
      const cookie = (
        response.headers['set-cookie'] as unknown as string[]
      )[0].split(';')[0];
      sessionHashes.push(hashSessionId(cookie.slice('fw_session='.length)));
      return { cookie, id: response.body.user.id as string };
    };
    const admin = await login('hq@northbean.example');
    const manager = await login('manager2@northbean.example');
    adminCookie = admin.cookie;
    adminId = admin.id;
    managerCookie = manager.cookie;
    managerId = manager.id;
    originals = (
      await pool.query(
        `SELECT id, display_name AS "displayName",
           avatar_storage_key AS "avatarStorageKey"
         FROM floorwalk.users WHERE id = ANY($1::uuid[])`,
        [[adminId, managerId]],
      )
    ).rows;
    const image = sharp({
      create: { width: 2, height: 2, channels: 3, background: '#317d64' },
    });
    png = await image.clone().png().toBuffer();
    jpeg = await image.clone().jpeg().toBuffer();
  }, 60000);

  afterAll(async () => {
    try {
      for (const original of originals)
        await pool.query(
          `UPDATE floorwalk.users SET display_name = $2, avatar_storage_key = $3
           WHERE id = $1`,
          [original.id, original.displayName, original.avatarStorageKey],
        );
      await pool.query(
        'DELETE FROM floorwalk.sessions WHERE token_hash = ANY($1::text[])',
        [sessionHashes],
      );
      for (const key of storageKeys) await storage.delete(key);
    } finally {
      await pool?.end();
      await app?.close();
    }
  });

  it('AC-02: admin 改本人昵称，店长 403，拒绝空白、超长与他人参数', async () => {
    const other = currentUserSchema.parse((await me(managerCookie)).body);
    for (const displayName of ['新', '名'.repeat(30)]) {
      const response = await request(app.getHttpServer())
        .patch('/api/me')
        .set('Cookie', adminCookie)
        .send({ displayName })
        .expect(200);
      expect(response.body.displayName).toBe(displayName);
      expect(response.body.id).toBe(adminId);
      expect(response.body).not.toHaveProperty('avatarUrl');
      expect((await me(adminCookie)).body.displayName).toBe(displayName);
    }
    for (const body of [
      { displayName: '  ' },
      { displayName: '名'.repeat(31) },
      { displayName: '越权昵称', userId: managerId },
    ])
      await request(app.getHttpServer())
        .patch('/api/me')
        .set('Cookie', adminCookie)
        .send(body)
        .expect(400);
    await request(app.getHttpServer())
      .patch('/api/me')
      .set('Cookie', managerCookie)
      .send({ displayName: '店长自行改名' })
      .expect(403);
    expect((await me(managerCookie)).body.displayName).toBe(other.displayName);
    const current = await me(adminCookie)
      .query({ userId: managerId })
      .expect(200);
    expect(current.body.id).toBe(adminId);
  });

  it('AC-01: 两角色可上传 jpeg/png，换头像后清旧对象，只返回 storageKey', async () => {
    for (const cookie of [adminCookie, managerCookie]) {
      const first = await upload(cookie).expect(201);
      const firstKey = remember(first);
      expect(Object.keys(first.body)).toEqual(['storageKey']);
      const second = await upload(cookie, jpeg, 'image/jpeg').expect(201);
      const secondKey = remember(second);
      expect(secondKey).not.toBe(firstKey);
      await expect(storage.get(firstKey)).rejects.toThrow();
      const current = currentUserSchema.parse((await me(cookie)).body);
      expect(current.avatarUrl).toBeTruthy();
      if (cookie === managerCookie) expect(current.site?.name).toBeTruthy();
      const url = new URL(current.avatarUrl!);
      expect(decodeURIComponent(url.pathname)).toContain(secondKey);
      await request(app.getHttpServer())
        .get(url.pathname + url.search)
        .expect(200)
        .expect('Content-Type', /image\/jpeg/);
    }
  });

  it('AC-01/05: 2 MiB 可上传，超限和非图片拒绝，夹带他人参数不修改任一头像', async () => {
    const exactLimit = Buffer.concat([
      png,
      Buffer.alloc(maxAvatarSizeBytes - png.length),
    ]);
    remember(await upload(adminCookie, exactLimit).expect(201));
    const oversize = await upload(
      adminCookie,
      Buffer.alloc(maxAvatarSizeBytes + 10),
    ).expect(400);
    expect(oversize.body.message).toContain('2 MB');
    await upload(adminCookie, png, 'image/gif').expect(400);
    await upload(adminCookie, Buffer.from('not-an-image')).expect(400);
    const before = [
      (await me(adminCookie)).body.avatarUrl,
      (await me(managerCookie)).body.avatarUrl,
    ].map((url: string) => new URL(url).pathname);
    await request(app.getHttpServer())
      .post('/api/me/avatar')
      .set('Cookie', adminCookie)
      .field('userId', managerId)
      .attach('file', png, { filename: 'avatar.png', contentType: 'image/png' })
      .expect(400);
    const after = [
      (await me(adminCookie)).body.avatarUrl,
      (await me(managerCookie)).body.avatarUrl,
    ].map((url: string) => new URL(url).pathname);
    expect(after).toEqual(before);
  });

  it('AC-01: 旧头像清理有限重试，持续失败返回错误并保留恢复线索', async () => {
    const initialKey = remember(await upload(adminCookie).expect(201));
    const deletion = vi.spyOn(storage, 'delete');
    try {
      deletion.mockRejectedValueOnce(new Error('temporary storage failure'));
      const replacementKey = remember(await upload(adminCookie).expect(201));
      expect(deletion).toHaveBeenCalledTimes(2);
      await expect(storage.get(initialKey)).rejects.toThrow();

      deletion.mockClear();
      for (let attempt = 0; attempt < 3; attempt += 1)
        deletion.mockRejectedValueOnce(new Error('storage unavailable'));
      const log = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});
      try {
        const failed = await upload(adminCookie).expect(500);
        expect(failed.body).not.toHaveProperty('storageKey');
        expect(deletion).toHaveBeenCalledTimes(3);
        expect(log).toHaveBeenCalledWith({
          event: 'avatar_cleanup_failed',
          storageKey: replacementKey,
        });
        const row = await pool.query<{ key: string }>(
          'SELECT avatar_storage_key AS key FROM floorwalk.users WHERE id = $1',
          [adminId],
        );
        storageKeys.push(row.rows[0].key);
        const current = currentUserSchema.parse((await me(adminCookie)).body);
        const url = new URL(current.avatarUrl!);
        expect(decodeURIComponent(url.pathname)).toContain(row.rows[0].key);
        await request(app.getHttpServer())
          .get(url.pathname + url.search)
          .expect(200);
        const previous = await storage.get(replacementKey);
        previous.stream.destroy();
      } finally {
        log.mockRestore();
      }
    } finally {
      deletion.mockRestore();
    }
  });

  it('AC-04/05: 存储驱动的外部签名不进入头像地址，应用签名验证后才读取驱动', async () => {
    const directUrl = vi.spyOn(storage, 'signedUrl').mockResolvedValue({
      url: 'https://private-bucket.oss-cn-hangzhou.aliyuncs.com/avatar.png',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    const read = vi.spyOn(storage, 'get');
    try {
      const current = currentUserSchema.parse((await me(adminCookie)).body);
      const url = new URL(current.avatarUrl!);
      expect(url.origin).toBe(new URL(process.env.API_PUBLIC_BASE_URL!).origin);
      expect(directUrl).not.toHaveBeenCalled();
      await request(app.getHttpServer())
        .get(url.pathname + url.search)
        .expect(200);
      expect(read).toHaveBeenCalledTimes(1);
      read.mockClear();
      url.searchParams.set('signature', 'tampered');
      await request(app.getHttpServer())
        .get(url.pathname + url.search)
        .expect(403);
      const expired = new URL(
        (await new LocalStorageDriver().signedUrl(storageKeys.at(-1)!, -1)).url,
      );
      await request(app.getHttpServer())
        .get(expired.pathname + expired.search)
        .expect(403);
      expect(read).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
      directUrl.mockRestore();
    }
  });

  it('AC-05: 本人链接有效期一小时，过期与篡改签名返回 403', async () => {
    const current = currentUserSchema.parse((await me(adminCookie)).body);
    const url = new URL(current.avatarUrl!);
    expect(
      Number(url.searchParams.get('expires')) - Date.now(),
    ).toBeGreaterThan(3590 * 1000);
    expect(
      Number(url.searchParams.get('expires')) - Date.now(),
    ).toBeLessThanOrEqual(3600 * 1000);
    url.searchParams.set('signature', 'tampered');
    await request(app.getHttpServer())
      .get(url.pathname + url.search)
      .expect(403);
    const key = storageKeys.at(-1)!;
    const expired = new URL((await storage.signedUrl(key, -1)).url);
    await request(app.getHttpServer())
      .get(expired.pathname + expired.search)
      .expect(403);
  });
});
